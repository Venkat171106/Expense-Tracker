import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";

function serializeBigInt(data: any): any {
  if (data === null || data === undefined) {
    return data;
  }
  if (typeof data === "bigint") {
    return data.toString();
  }
  if (Array.isArray(data)) {
    return data.map(serializeBigInt);
  }
  if (typeof data === "object" && !(data instanceof Date)) {
    const result: Record<string, any> = {};
    for (const key of Object.keys(data)) {
      result[key] = serializeBigInt(data[key]);
    }
    return result;
  }
  return data;
}

@Injectable()
export class BigIntInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(map((data) => serializeBigInt(data)));
  }
}
