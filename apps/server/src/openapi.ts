// The REST API described for tools (OpenAPI 3.1): served at /v1/openapi.json and linked from the developer docs.
export function openapi(base: string) {
  const err = (description: string) => ({ description, content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } });
  const lessonId = { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'The lesson id.' };
  return {
    openapi: '3.1.0',
    info: {
      title: 'Living Textbook API',
      version: '1.0.0',
      description: 'Turn a photo of a textbook page into a living lesson: animated over the printed page, narrated, checked against the page, with a voice tutor and a quiz. Call the API from your server with a secret key (ltsk_...); show lessons in your app with the embed (see the developer docs).',
    },
    servers: [{ url: `${base}/v1` }],
    security: [{ secretKey: [] }],
    externalDocs: { url: `${base}/developers`, description: 'Developer docs' },
    paths: {
      '/lessons': {
        post: {
          operationId: 'createLesson',
          summary: 'Make a lesson from a page image',
          description: 'Reads the page, builds the animated lesson, voices it and checks it against the page. Takes 10–30 s; the response arrives when the lesson is ready. Add ?stream=true to receive progress as server-sent events ("progress", then "lesson" or "error").',
          parameters: [{ name: 'stream', in: 'query', schema: { type: 'boolean' }, description: 'Stream progress as server-sent events.' }],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': { schema: { type: 'object', required: ['image'], properties: { image: { type: 'string', format: 'binary', description: 'JPEG, PNG or WebP, up to 15 MB.' }, external_user_id: { type: 'string', maxLength: 128 }, metadata: { type: 'string', description: 'A JSON object of up to 20 string values.' } } } },
              'application/json': { schema: { type: 'object', properties: { image_url: { type: 'string', format: 'uri', description: 'A public https URL of the image.' }, image_base64: { type: 'string', description: 'The image, base64-encoded (a data: URL prefix is allowed).' }, external_user_id: { type: 'string', maxLength: 128 }, metadata: { type: 'object', additionalProperties: { type: 'string' }, maxProperties: 20 } } } },
              'image/jpeg': { schema: { type: 'string', format: 'binary' } },
              'image/png': { schema: { type: 'string', format: 'binary' } },
              'image/webp': { schema: { type: 'string', format: 'binary' } },
            },
          },
          responses: {
            201: { description: 'The lesson.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Lesson' } }, 'text/event-stream': { schema: { type: 'string' } } } },
            400: err('The request is invalid (no image, bad metadata).'), 401: err('The key is missing, invalid or revoked.'), 403: err('A publishable key was used.'),
            413: err('The image is larger than 15 MB.'), 415: err('The body or image type is not supported.'), 422: err('The image is not a page of a book.'),
            429: err('Rate limit or daily allowance reached.'), 502: err('The lesson could not be made.'),
          },
        },
        get: {
          operationId: 'listLessons',
          summary: 'List your lessons, newest first',
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
            { name: 'starting_after', in: 'query', schema: { type: 'string' }, description: 'A lesson id from the previous page.' },
            { name: 'external_user_id', in: 'query', schema: { type: 'string' } },
          ],
          responses: { 200: { description: 'A page of lessons.', content: { 'application/json': { schema: { $ref: '#/components/schemas/LessonList' } } } }, 401: err('Unauthorised.') },
        },
      },
      '/lessons/{id}': {
        get: { operationId: 'getLesson', summary: 'Get a lesson', parameters: [lessonId], responses: { 200: { description: 'The lesson.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Lesson' } } } }, 404: err('Not one of your lessons.') } },
        delete: { operationId: 'deleteLesson', summary: 'Delete a lesson', parameters: [lessonId], responses: { 200: { description: 'Deleted.', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'string' }, object: { const: 'lesson' }, deleted: { const: true } } } } } }, 404: err('Not one of your lessons.') } },
      },
      '/lessons/{id}/quiz': {
        get: { operationId: 'getLessonQuiz', summary: "A quiz from the page's own text", description: 'Made on first request (a few seconds), then kept.', parameters: [lessonId], responses: { 200: { description: 'The quiz.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Quiz' } } } }, 404: err('Not one of your lessons, or no quiz could be made.') } },
      },
      '/usage': {
        get: { operationId: 'getUsage', summary: 'Lessons made today and over the last 14 days', responses: { 200: { description: 'Usage.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Usage' } } } } } },
      },
    },
    components: {
      securitySchemes: { secretKey: { type: 'http', scheme: 'bearer', description: 'Your secret key: Authorization: Bearer ltsk_...' } },
      schemas: {
        Lesson: {
          type: 'object',
          properties: {
            id: { type: 'string' }, object: { const: 'lesson' }, created_at: { type: 'string', format: 'date-time' },
            status: { enum: ['ready', 'processing'] }, title: { type: 'string' }, subject: { type: 'string' }, kind: { type: 'string' },
            language: { type: 'string', description: 'The language of the page, detected (BCP-47).' }, summary: { type: 'string' },
            steps: { type: 'array', items: { type: 'object', properties: { index: { type: 'integer' }, title: { type: 'string' }, narration: { type: 'string' } } } },
            verification: { type: ['object', 'null'], properties: { status: { enum: ['verified-page', 'checked-independently', 'faithful', 'unverified', 'failed'] }, summary: { type: 'string' }, checks: { type: 'integer' }, passed: { type: 'integer' } } },
            page: { type: 'object', properties: { width: { type: 'integer' }, height: { type: 'integer' }, image_url: { type: ['string', 'null'] } } },
            share_url: { type: 'string', description: 'Opens the lesson in Living Textbook.' },
            embed_url: { type: 'string', description: 'Put in an iframe, or use the embed SDK.' },
            source: { enum: ['api', 'embed'] }, external_user_id: { type: ['string', 'null'] }, metadata: { type: 'object', additionalProperties: { type: 'string' } },
          },
        },
        LessonList: { type: 'object', properties: { object: { const: 'list' }, data: { type: 'array', items: { $ref: '#/components/schemas/Lesson' } }, has_more: { type: 'boolean' } } },
        Quiz: { type: 'object', properties: { object: { const: 'quiz' }, lesson_id: { type: 'string' }, language: { type: 'string' }, questions: { type: 'array', items: { type: 'object', properties: { question: { type: 'string' }, options: { type: 'array', items: { type: 'string' } }, answer_index: { type: 'integer' }, explanation: { type: 'string' } } } } } },
        Usage: { type: 'object', properties: { object: { const: 'usage' }, daily_limit: { type: 'integer' }, per_minute_limit: { type: 'integer' }, today: { $ref: '#/components/schemas/UsageDay' }, days: { type: 'array', items: { $ref: '#/components/schemas/UsageDay' } } } },
        UsageDay: { type: 'object', properties: { day: { type: 'string', format: 'date' }, lessons: { type: 'integer' }, by_key: { type: 'object', additionalProperties: { type: 'integer' } } } },
        Error: { type: 'object', properties: { error: { type: 'object', properties: { type: { enum: ['invalid_request_error', 'authentication_error', 'permission_error', 'not_found_error', 'rate_limit_error', 'api_error'] }, code: { type: 'string' }, message: { type: 'string' } } } } },
      },
    },
  };
}
