import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import _ from "lodash";
import { CrudException } from "../../../../core/platform/framework/api/crud-service";
import { ResourceGetResponse } from "../../../../utils/types";
import {
  ApplicationObject,
  getApplicationObject,
} from "../../../applications/entities/application";
import gr from "../../../global-resolver";
import { logger } from "../../../../core/platform/framework/logger";
import {
  ApplicationApiExecutionContext,
  ApplicationLoginRequest,
  ApplicationLoginResponse,
  ConfigureRequest,
} from "../types";
import { ConsoleHookUser } from "src/services/console/types";
import User from "src/services/user/entities/user";

export class ApplicationsApiController {
  async token(
    request: FastifyRequest<{ Body: ApplicationLoginRequest }>,
  ): Promise<ResourceGetResponse<ApplicationLoginResponse>> {
    const context = getExecutionContext(request);

    if (!request.body.id || !request.body.secret) {
      throw CrudException.forbidden("Application not found");
    }

    const app = await gr.services.applications.marketplaceApps.get(request.body.id, context);

    if (!app) {
      throw CrudException.forbidden("Application not found");
    }

    if (!app.api.private_key || app.api.private_key !== request.body.secret) {
      throw CrudException.forbidden("Secret key is not valid");
    }

    return {
      resource: {
        access_token: gr.platformServices.auth.generateJWT(request.body.id, null, "", {
          track: false,
          provider_id: "",
          application_id: request.body.id,
        }),
      },
    };
  }

  async me(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<ResourceGetResponse<ApplicationObject>> {
    const context = getExecutionContext(request);

    const entity = await gr.services.applications.marketplaceApps.get(
      context.application_id,

      context,
    );
    if (!entity) {
      throw CrudException.notFound("Application not found");
    }

    return { resource: getApplicationObject(entity) };
  }

  async configure(
    request: FastifyRequest<{ Body: ConfigureRequest }>,
    _reply: FastifyReply,
  ): Promise<Record<string, string>> {
    const app_id = request.currentUser.application_id;
    const context = getExecutionContext(request);
    const application = await gr.services.applications.marketplaceApps.get(app_id, context);

    if (!application) {
      throw CrudException.forbidden("Application not found");
    }

    return { status: "ok" };
  }

  async proxy(
    request: FastifyRequest<{ Params: { company_id: string; service: string; version: string } }>,
    reply: FastifyReply,
    fastify: FastifyInstance,
  ): Promise<void> {
    // Check the application has access to this company
    const company_id = request.params.company_id;
    const companyApplication = gr.services.applications.companyApps.get({
      company_id,
      application_id: request.currentUser.application_id,
      id: undefined,
    });
    if (!companyApplication) {
      throw CrudException.forbidden("This application is not installed in the requested company");
    }

    const context = getExecutionContext(request);
    const app = await gr.services.applications.marketplaceApps.get(
      request.currentUser.application_id,
      context,
    );

    // Check call can be done from this IP
    if (
      app.api.allowed_ips.trim() &&
      app.api.allowed_ips !== "*" &&
      !_.includes(
        app.api.allowed_ips
          .split(",")
          .map(a => a.trim())
          .filter(a => a),
        request.ip,
      )
    ) {
      throw CrudException.forbidden(
        `This application is not allowed to access from this IP (${request.ip})`,
      );
    }

    //TODO Check application access rights (write, read, remove for each micro services)
    const _access = app.access;

    //TODO save some statistics about API usage for application and per companies

    const route = request.url.replace("/api/", "/internal/services/");

    fastify.inject(
      {
        method: request.method as any,
        url: route,
        payload: request.body as any,
        headers: _.pick(request.headers, "authorization"),
      },
      (err, response) => {
        reply.headers(response.headers);
        reply.send(response.payload);
      },
    );
  }

  async syncUsers(
    request: FastifyRequest<{
      Body: {
        email: string;
        first_name: string;
        last_name: string;
      };
    }>,
  ): Promise<User> {
    try {
      return await gr.services.console.getClient().updateLocalUserFromConsole({
        email: request.body.email.trim().toLocaleLowerCase(),
        name: request.body.first_name,
        surname: request.body.last_name,
      } as ConsoleHookUser);
    } catch (err) {
      logger.error(err);
      throw err;
    }
  }
}

function getExecutionContext(request: FastifyRequest): ApplicationApiExecutionContext {
  return {
    application_id: request.currentUser?.application_id,
    user: request.currentUser,
    url: request.url,
    method: request.routeOptions.method,
    transport: "http",
  };
}
