# Logging Guide

## Structured Logging with Pino

The chat-service uses Pino for high-performance structured JSON logging.

### Configuration

Set log level via environment variable:
```bash
LOG_LEVEL=debug  # trace, debug, info, warn, error, fatal
```

### Development Mode

Pretty-printed logs with colors:
```
[15:40:25.599] INFO: Starting Nest application... {"context":"NestFactory"}
[15:40:25.603] INFO: 🚀 Application is running on: http://localhost:3000
```

### Production Mode

JSON format for log aggregation:
```json
{"level":30,"time":1706971225599,"msg":"Starting Nest application...","context":"NestFactory"}
{"level":30,"time":1706971225603,"msg":"🚀 Application is running on: http://localhost:3000"}
```

### Using the Logger in Your Code

```typescript
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MyService {
  private readonly logger = new Logger(MyService.name);

  doSomething() {
    this.logger.log('Action started');
    this.logger.debug('Debug information', { extra: 'data' });
    this.logger.warn('Warning message');
    this.logger.error('Error occurred', error.stack);
  }
}
```

### HTTP Request Logging

Pino automatically logs all HTTP requests:
- Request method, URL, user agent
- Response status code, time
- Response time in milliseconds

### Log Levels

1. **trace** (10): Very detailed, trace function calls
2. **debug** (20): Debug information for development
3. **info** (30): General informational messages (default)
4. **warn** (40): Warning messages
5. **error** (50): Error messages
6. **fatal** (60): Fatal errors before crash
