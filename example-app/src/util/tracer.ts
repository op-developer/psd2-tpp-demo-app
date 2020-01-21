import tracer from 'dd-trace';
// initialized in a different file to avoid hoisting

if (process.env.HOST_ENV === 'aws' && process.env.APP_ENVIRONMENT !== 'prod') {
  tracer.init({
    service: 'oop-tpp-demo-app',
  });

  tracer.use('express', {
    blacklist: ['/health-check'],
  });
  console.info(`Datadog tracing enabled in ${process.env.APP_ENVIRONMENT}`);
} else {
  console.info(`Datadog tracing NOT enabled in ${process.env.APP_ENVIRONMENT}`);
}
export default tracer;
