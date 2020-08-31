import { Doc } from "../../fields/Doc";
import { DocServer } from "../DocServer";
import { MainView } from "../views/MainView";
import * as qs from 'query-string';
import { Utils, OmitKeys } from "../../Utils";

export namespace HistoryUtil {
    export interface DocInitializerList {
        [key: string]: string | number;
    }

    export interface DocUrl {
        type: "doc";
        docId: string;
        initializers?: {
            [docId: string]: DocInitializerList;
        };
        safe?: boolean;
        readonly?: boolean;
        nro?: boolean;
        sharing?: boolean;
    }

    export type ParsedUrl = DocUrl;

    // const handlers: ((state: ParsedUrl | null) => void)[] = [];
    function onHistory(e: PopStateEvent) {
        if (window.location.pathname !== "/home") {
            const url = e.state as ParsedUrl || parseUrl(window.location);
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

    let _lastStatePush = 0;
    export function pushState(state: ParsedUrl) {
        if (Date.now() - _lastStatePush > 1000) {
            history.replaceState(state, "", createUrl(state));
            history.pushState(state, "", createUrl(state));
        }
        _lastStatePush = Date.now();
    }

    export function replaceState(state: ParsedUrl) {
        history.replaceState(state, "", createUrl(state));
    }

    function copyState(state: ParsedUrl): ParsedUrl {
        return JSON.parse(JSON.stringify(state));
    }

    export function getState(): ParsedUrl {
        const state = copyState(history.state);
        state.initializers = state.initializers || {};
        return state;
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

    const parsers: { [type: string]: (pathname: string[], opts: qs.ParsedQuery) => ParsedUrl | undefined } = {};
    const stringifiers: { [type: string]: (state: ParsedUrl) => string } = {};

    type ParserValue = true | "none" | "json" | ((value: string) => any);

    type Parser = {
        [key: string]: ParserValue
    };

    function addParser(type: string, requiredFields: Parser, optionalFields: Parser, customParser?: (pathname: string[], opts: qs.ParsedQuery, current: ParsedUrl) => ParsedUrl | null | undefined) {
        function parse(parser: ParserValue, value: string | string[] | null | undefined) {
            if (value === undefined || value === null) {
                return value;
            }
            if (Array.isArray(value)) {
            } else if (parser === true || parser === "json") {
                value = JSON.parse(value);
            } else if (parser === "none") {
            } else {
                value = parser(value);
            }
            return value;
        }
        parsers[type] = (pathname, opts) => {
            const current: any = { type };
            for (const required in requiredFields) {
                if (!(required in opts)) {
                    return undefined;
                }
                const parser = requiredFields[required];
                let value = opts[required];
                value = parse(parser, value);
                if (value !== null && value !== undefined) {
                    current[required] = value;
                }
            }
            for (const opt in optionalFields) {
                if (!(opt in opts)) {
                    continue;
                }
                const parser = optionalFields[opt];
                let value = opts[opt];
                value = parse(parser, value);
                if (value !== undefined) {
                    current[opt] = value;
                }
            }
            if (customParser) {
                const val = customParser(pathname, opts, current);
                if (val === null) {
                    return undefined;
                } else if (val === undefined) {
                    return current;
                } else {
                    return val;
                }
            }
            return current;
        };
    }

    function addStringifier(type: string, keys: string[], customStringifier?: (state: ParsedUrl, current: string) => string) {
        stringifiers[type] = state => {
            let path = Utils.prepend(`/${type}`);
            if (customStringifier) {
                path = customStringifier(state, path);
            }
            const queryObj = OmitKeys(state, keys).extract;
            const query: any = {};
            Object.keys(queryObj).forEach(key => query[key] = queryObj[key] === null ? null : JSON.stringify(queryObj[key]));
            const queryString = qs.stringify(query);
            return path + (queryString ? `?${queryString}` : "");
        };
    }

    addParser("doc", {}, { readonly: true, initializers: true, nro: true, sharing: true }, (pathname, opts, current) => {
        if (pathname.length !== 2) return undefined;

        current.initializers = current.initializers || {};
        const docId = pathname[1];
        current.docId = docId;
    });
    addStringifier("doc", ["initializers", "readonly", "nro"], (state, current) => {
        return `${current}/${state.docId}`;
    });


    export function parseUrl(location: Location | URL): ParsedUrl | undefined {
        const pathname = location.pathname.substring(1);
        const search = location.search;
        const opts = search.length ? qs.parse(search, { sort: false }) : {};
        const pathnameSplit = pathname.split("/");

        const type = pathnameSplit[0];

        if (type in parsers) {
            return parsers[type](pathnameSplit, opts);
        }

        return undefined;
    }

    export function createUrl(params: ParsedUrl): string {
        if (params.type in stringifiers) {
            return stringifiers[params.type](params);
        }
        return "";
    }

    export async function initDoc(id: string, initializer: DocInitializerList) {
        const doc = await DocServer.GetRefField(id);
        if (!(doc instanceof Doc)) {
            return;
        }
        if (initializer._viewTransition) {
            doc._viewTransition = initializer._viewTransition;
        }
        Doc.assign(doc, initializer);
    }

    async function onDocUrl(url: DocUrl) {
        const field = await DocServer.GetRefField(url.docId);
        const init = url.initializers;
        if (init) {
            await Promise.all(Object.keys(init).map(id => initDoc(id, init[id])));
        }
        // if (field instanceof Doc) {
        //     CurrentUserUtils.openDashboard(Doc.UserDoc(), field, true);
        // }
    }

    window.onpopstate = onHistory;
}
