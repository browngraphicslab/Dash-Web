import ApiManager, { Registration } from "./ApiManager";
import { Method, _permission_denied } from "../RouteManager";
import { GoogleApiServerUtils } from "../apis/google/GoogleApiServerUtils";
import { Database } from "../database";
import RouteSubscriber from "../RouteSubscriber";

const deletionPermissionError = "Cannot perform specialized delete outside of the development environment!";

const EndpointHandlerMap = new Map<GoogleApiServerUtils.Action, GoogleApiServerUtils.ApiRouter>([
    ["create", (api, params) => api.create(params)],
    ["retrieve", (api, params) => api.get(params)],
    ["update", (api, params) => api.batchUpdate(params)],
]);

export default class GeneralGoogleManager extends ApiManager {

    protected initialize(register: Registration): void {

        register({
            method: Method.GET,
            subscription: "/readGoogleAccessToken",
            secureHandler: async ({ user, res }) => {
                const token = await GoogleApiServerUtils.retrieveAccessToken(user.id);
                if (!token) {
                    return res.send(GoogleApiServerUtils.generateAuthenticationUrl());
                }
                return res.send(token);
            }
        });

        register({
            method: Method.POST,
            subscription: "/writeGoogleAccessToken",
            secureHandler: async ({ user, req, res }) => {
                res.send(await GoogleApiServerUtils.processNewUser(user.id, req.body.authenticationCode));
            }
        });

        register({
            method: Method.POST,
            subscription: new RouteSubscriber("googleDocs").add("sector", "action"),
            secureHandler: async ({ req, res, user }) => {
                const sector: GoogleApiServerUtils.Service = req.params.sector as GoogleApiServerUtils.Service;
                const action: GoogleApiServerUtils.Action = req.params.action as GoogleApiServerUtils.Action;
                const endpoint = await GoogleApiServerUtils.GetEndpoint(GoogleApiServerUtils.Service[sector], user.id);
                const handler = EndpointHandlerMap.get(action);
                if (endpoint && handler) {
                    try {
                        const response = await handler(endpoint, req.body);
                        res.send(response.data);
                    } catch (e) {
                        res.send(e);
                    }
                    return;
                }
                res.send(undefined);
            }
        });

    }
}