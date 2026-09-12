// Runs before each e2e test file's module graph loads — crucially, before
// `import { AppModule }` executes `ConfigModule.forRoot()`'s Joi validation,
// which happens at decorator-evaluation time (i.e. before any `beforeAll`
// in the test file itself would get a chance to set these).
process.env.TURN_SHARED_SECRET ??= 'test-only-secret-value';
process.env.CORS_ORIGIN ??= '*';
