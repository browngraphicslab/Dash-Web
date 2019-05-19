import { Doc, Opt, Field } from "../../new_fields/Doc";
import { DocServer } from "../DocServer";
import { RouteStore } from "../../server/RouteStore";
import { MainView } from "../views/MainView";

export namespace HistoryUtil {
    export interface DocInitializerList {
        [key: string]: string | number;
    }

    export interface DocUrl {
        type: "doc";
        docId: string;
        initializers: {
            [docId: string]: DocInitializerList;
        };
    }

    export type ParsedUrl = DocUrl;

    // const handlers: ((state: ParsedUrl | null) => void)[] = [];
    function onHistory(e: PopStateEvent) {
        if (window.location.pathname !== RouteStore.home) {
            const url = e.state as ParsedUrl || parseUrl(window.location.pathname);
            if (url) {
                switch (url.type) {
                    case "doc":
                        onDocUrl(url);
                        break;
                }
            }
        }
        // for (const handler of handlers) {
        //     handler(e.state);
        // }
    }

    export function pushState(state: ParsedUrl) {
        history.pushState(state, "", createUrl(state));
    }

    export function replaceState(state: ParsedUrl) {
        history.replaceState(state, "", createUrl(state));
    }

    function copyState(state: ParsedUrl): ParsedUrl {
        return JSON.parse(JSON.stringify(state));
    }

    export function getState(): ParsedUrl {
        return copyState(history.state);
    }

    // export function addHandler(handler: (state: ParsedUrl | null) => void) {
    //     handlers.push(handler);
    // }

    // export function removeHandler(handler: (state: ParsedUrl | null) => void) {
    //     const index = handlers.indexOf(handler);
    //     if (index !== -1) {
    //         handlers.splice(index, 1);
    //     }
    // }

    export function parseUrl(pathname: string): ParsedUrl | undefined {
        let pathnameSplit = pathname.split("/");
        if (pathnameSplit.length !== 2) {
            return undefined;
        }
        const type = pathnameSplit[0];
        const data = pathnameSplit[1];

        if (type === "doc") {
            const s = data.split("?");
            if (s.length < 1 || s.length > 2) {
                return undefined;
            }
            const docId = s[0];
            const initializers = s.length === 2 ? JSON.parse(decodeURIComponent(s[1])) : {};
            return {
                type: "doc",
                docId,
                initializers
            };
        }

        return undefined;
    }

    export function createUrl(params: ParsedUrl): string {
        let baseUrl = DocServer.prepend(`/${params.type}`);
        switch (params.type) {
            case "doc":
                const initializers = encodeURIComponent(JSON.stringify(params.initializers));
                const id = params.docId;
                let url = baseUrl + `/${id}`;
                if (Object.keys(params.initializers).length) {
                    url += `?${initializers}`;
                }
                return url;
        }
        return "";
    }

    export async function initDoc(id: string, initializer: DocInitializerList) {
        const doc = await DocServer.GetRefField(id);
        if (!(doc instanceof Doc)) {
            return;
        }
        Doc.assign(doc, initializer);
    }

    async function onDocUrl(url: DocUrl) {
        const field = await DocServer.GetRefField(url.docId);
        await Promise.all(Object.keys(url.initializers).map(id => initDoc(id, url.initializers[id])));
        if (field instanceof Doc) {
            MainView.Instance.openWorkspace(field, true);
        }
    }

    window.onpopstate = onHistory;
}
