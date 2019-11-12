import ApiManager, { Registration } from "./ApiManager";
import { Method, _permission_denied } from "../RouteManager";
import { GoogleApiServerUtils } from "../apis/google/GoogleApiServerUtils";
import { Database } from "../database";
import RouteSubscriber from "../RouteSubscriber";

const deletionPermissionError = "Cannot perform specialized delete outside of the development environment!";
const ServicesApiKeyMap = new Map<string, string | undefined>([
    ["face", process.env.FACE],
    ["vision", process.env.VISION],
    ["handwriting", process.env.HANDWRITING]
]);
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
            onValidation: async ({ user, res }) => {
                const userId = user.id;
                const token = await GoogleApiServerUtils.retrieveAccessToken(userId);
                if (!token) {
                    return res.send(GoogleApiServerUtils.generateAuthenticationUrl());
                }
                return res.send(token);
            }
        });

        register({
            method: Method.POST,
            subscription: "/writeGoogleAccessToken",
            onValidation: async ({ user, req, res }) => {
                res.send(await GoogleApiServerUtils.processNewUser(user.id, req.body.authenticationCode));
            }
        });

        register({
            method: Method.GET,
            subscription: "/deleteWithGoogleCredentials",
            onValidation: async ({ res, isRelease }) => {
                if (isRelease) {
                    return _permission_denied(res, deletionPermissionError);
                }
                await Database.Auxiliary.GoogleAuthenticationToken.DeleteAll();
                res.redirect("/delete");
            }
        });

        register({
            method: Method.GET,
            subscription: new RouteSubscriber("/cognitiveServices").add('requestedservice'),
            onValidation: ({ req, res }) => {
                let service = req.params.requestedservice;
                res.send(ServicesApiKeyMap.get(service));
            }
        });

        register({
            method: Method.POST,
            subscription: new RouteSubscriber("/googleDocs").add("sector", "action"),
            onValidation: async ({ req, res, user }) => {
                let sector: GoogleApiServerUtils.Service = req.params.sector as GoogleApiServerUtils.Service;
                let action: GoogleApiServerUtils.Action = req.params.action as GoogleApiServerUtils.Action;
                const endpoint = await GoogleApiServerUtils.GetEndpoint(GoogleApiServerUtils.Service[sector], user.id);
                let handler = EndpointHandlerMap.get(action);
                if (endpoint && handler) {
                    handler(endpoint, req.body)
                        .then(response => res.send(response.data))
                        .catch(exception => res.send(exception));
                    return;
                }
                res.send(undefined);
            }
        });
    }
}