import request from 'supertest';
import createApp from '../src/app/app';

const envName = 'psd2-sandbox-prod';
describe('Application', () => {
  it('should return 200', async (done) => {
    const app = await createApp();
    request(app).get('/health-check')
      .expect(200, done);
  });

  it('Random url should return 404', async (done) => {
    const app = await createApp();
    request(app).get('/reset')
      .expect(404, done);
  });

  it('/accounts should return 200 ok', async (done) => {
    const app = await createApp();
    request(app)
      .get('/accounts')
      .expect(200, done);
  });

  it('/ should redirect to accounts', async (done) => {
    const app = await createApp();
    request(app)
      .get('/')
      .expect(302)
      .expect('Location', '/accounts', done);
  });

  it('/logout should redirect', async (done) => {
    const app = await createApp();
    request(app).get('/logout')
      .expect(302, done);
  });
});
