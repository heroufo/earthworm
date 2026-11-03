import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { Request } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";

export const UncheckAuth = () => SetMetadata("uncheck", true);
export const Permissions = (...permissions: string[]) => SetMetadata("permissions", permissions);

/**
 * 本地部署模式（Local Mode）
 * ------------------------------------------------------------
 * 原项目依赖 Logto 认证服务签发 JWT。本地单机部署时没有 Logto，
 * 因此这里支持一个固定的本地 token：携带该 token 的请求直接视为
 * 已登录的本地用户，跳过 JWKS 验签。
 *
 * 如需恢复原版 Logto 认证，只需把 LOCAL_MODE 设为 false 或不配置
 * LOCAL_AUTH_TOKEN 即可（原逻辑完整保留）。
 */
const LOCAL_AUTH_TOKEN = process.env.LOCAL_AUTH_TOKEN || "earthworm-local-token";
const LOCAL_USER_ID = process.env.LOCAL_USER_ID || "local-user";
const LOCAL_MODE = process.env.LOCAL_MODE !== "false";

@Injectable()
export class AuthGuard implements CanActivate {
  private jwks: any;
  constructor() {
    // Logto 未配置时不能创建 JWKS（否则 URL 解析失败会导致服务无法启动）
    const endpoint = process.env.LOGTO_ENDPOINT;
    if (endpoint) {
      try {
        this.jwks = createRemoteJWKSet(new URL("/oidc/jwks", endpoint));
      } catch {
        this.jwks = null;
      }
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);
    const uncheck = Reflect.getMetadata("uncheck", context.getHandler());
    const permissions = Reflect.getMetadata("permissions", context.getHandler());

    // 本地模式：固定 token 直接放行，注入本地用户 ID
    if (LOCAL_MODE && token && token === LOCAL_AUTH_TOKEN) {
      request["userId"] = LOCAL_USER_ID;
      return true;
    }

    if (!token && uncheck) {
      request["userId"] = null;
    } else if (!token) {
      throw new UnauthorizedException();
    }
    try {
      const payload = await this.jwtVerify(token);

      const scopes = typeof payload.scope === "string" ? payload.scope.split(" ") : [];

      if (permissions) {
        if (!permissions.every((scope) => scopes.includes(scope))) {
          throw new UnauthorizedException();
        }
      }

      request["userId"] = payload.sub;
    } catch (e) {
      if (!uncheck) {
        throw new UnauthorizedException();
      }
    }
    return true;
  }

  private async jwtVerify(token) {
    if (!this.jwks) {
      throw new UnauthorizedException();
    }

    const { payload } = await jwtVerify(
      // The raw Bearer Token extracted from the request header
      token,
      this.jwks,
      {
        // Expected issuer of the token, issued by the Logto server
        issuer: new URL("oidc", process.env.LOGTO_ENDPOINT).href,
        // Expected audience token, the resource indicator of the current API
        audience: process.env.BACKEND_ENDPOINT,
      },
    );

    return payload;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(" ") ?? [];
    return type === "Bearer" ? token : undefined;
  }
}
