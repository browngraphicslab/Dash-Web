import ApiManager, { Registration } from "./ApiManager";
import { Method } from "../RouteManager";
import request = require('request-promise');

export default class DiagnosticManager extends ApiManager {

    protected initialize(register: Registration): void {

        register({
            method: Method.GET,
            subscription: "/serverHeartbeat",
            onValidation: ({ res }) => res.send(true)
        });

        register({
            method: Method.GET,
            subscription: "/solrHeartbeat",
            onValidation: async ({ res }) => {
                const response = await request("http://localhost:8983");
                res.send(response !== undefined);
            }
        });

    }

}