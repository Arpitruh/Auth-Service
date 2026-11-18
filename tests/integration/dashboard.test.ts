import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { ENV } from '../../src/config/env.js';

describe.skipIf(!process.env.RUN_CONTROL_TESTS || !ENV.DASHBOARD_OPERATOR_PASSWORD_HASH)(
  'Auth Garden control-plane dashboard', () => {
    const app=createApp();
    let cookie:string='';
    let csrf:string='';
    let createdId:string='';
    it('does not expose control-plane data to anonymous visitors',async()=>{
      const response=await request(app).get('/dashboard');
      expect(response.status).toBe(303);
      expect(response.header.location).toBe('/dashboard/login');
      const login=await request(app).get('/dashboard/login');
      expect(login.status).toBe(200);
      for(const color of ['#EBEBD8','#637545','#455230','#9BA685']){
        expect(login.text).toContain(color);
      }
    });
    it('rejects incorrect credentials before creating a session',async()=>{
      const bad=await request(app).post('/dashboard/login').type('form')
        .send({username:'ci-operator',password:'wrong'});
      expect(bad.status).toBe(401);
      expect(bad.headers['set-cookie']).toBeUndefined();
    });
    it('authenticates an operator with HttpOnly cookie',async()=>{
      const res=await request(app).post('/dashboard/login').type('form')
        .send({username:'ci-operator',password:'ci-test-password-123'});
      expect(res.status).toBe(303);
      const header=res.headers['set-cookie'] as string[];
      cookie=header[0].split(';')[0];
      expect(header[0]).toContain('HttpOnly');
      expect(header[0]).toContain('SameSite=Strict');
      const dashboard=await request(app).get('/dashboard').set('Cookie',cookie);
      expect(dashboard.status).toBe(200);
      expect(dashboard.text).toContain('Your applications');
      const newPage=await request(app).get('/dashboard/new').set('Cookie',cookie);
      expect(newPage.status).toBe(200);
      csrf=/name="_csrf" value="([^"]+)"/.exec(newPage.text)?.[1]??'';
      expect(csrf.length).toBeGreaterThan(30);
    });
    it('enforces anti-CSRF and creates draft application without provisioning',async()=>{
      const data={name:'Dashboard CI '+Date.now(),slug:'dash-'+randomUUID().slice(0,8),
        redirectUri:'https://dashboard-app.example.com/callback',provider:'POSTGRESQL',
        mode:'EXTERNAL'};
      const bad=await request(app).post('/dashboard/apps').set('Cookie',cookie)
        .type('form').send({...data,_csrf:'wrong'});
      expect(bad.status).toBe(400);
      const cross=await request(app).post('/dashboard/apps').set('Cookie',cookie)
        .set('Origin','https://attacker.example.com').type('form')
        .send({...data,_csrf:csrf});
      expect(cross.status).toBe(400);
      const created=await request(app).post('/dashboard/apps').set('Cookie',cookie)
        .type('form').send({...data,_csrf:csrf});
      expect(created.status).toBe(303);
      createdId=created.headers.location.split('/').pop();
      expect(createdId).toMatch(/^[a-f0-9-]{36}$/);
      const detail=await request(app).get('/dashboard/apps/'+createdId).set('Cookie',cookie);
      expect(detail.status).toBe(200);
      expect(detail.text).toContain('PENDING');
      expect(detail.text).toContain('DRAFT');
    });
    it('saves per-app policy and rejects activation until its database is ready',async()=>{
      const notReady=await request(app).post('/dashboard/apps/'+createdId+'/activate')
        .set('Cookie',cookie).type('form').send({_csrf:csrf});
      expect(notReady.status).toBe(400);
      const changed=await request(app).post('/dashboard/apps/'+createdId+'/settings')
        .set('Cookie',cookie).type('form')
        .send({_csrf:csrf,sessionMinutes:90});
      expect(changed.status).toBe(303);
      const detail=await request(app).get('/dashboard/apps/'+createdId).set('Cookie',cookie);
      expect(detail.text).toContain('value="90"');
    });
    it('logs out and revokes the operator session',async()=>{
      const logout=await request(app).post('/dashboard/logout').set('Cookie',cookie)
        .type('form').send({_csrf:csrf});
      expect(logout.status).toBe(303);
      const after=await request(app).get('/dashboard').set('Cookie',cookie);
      expect(after.status).toBe(303);
    });
    afterAll(async()=>{
      if(!process.env.RUN_CONTROL_TESTS || !ENV.DASHBOARD_OPERATOR_PASSWORD_HASH)return;
      const [{ closeDashboardRepo }, { closeControlPlane }] = await Promise.all([
        import('../../src/dashboard/repository.js'), import('../../src/control-plane/registry.js'),
      ]);
      await Promise.all([closeDashboardRepo(),closeControlPlane()]);
    });
  });
