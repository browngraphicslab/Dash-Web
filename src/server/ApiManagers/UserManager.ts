import ApiManager, { Registration } from "./ApiManager";
import { Method } from "../RouteManager";
import { WebSocket } from "../Websocket/Websocket";
import { Database } from "../database";

export default class UserManager extends ApiManager {

    protected initialize(register: Registration): void {

        register({
            method: Method.GET,
            subscription: "/getUsers",
            onValidation: async ({ res }) => {
                const cursor = await Database.Instance.query({}, { email: 1, userDocumentId: 1 }, "users");
                const results = await cursor.toArray();
                res.send(results.map(user => ({ email: user.email, userDocumentId: user.userDocumentId })));
            }
        });

        register({
            method: Method.GET,
            subscription: "/getUserDocumentId",
            onValidation: ({ res, user }) => res.send(user.userDocumentId)
        });

        register({
            method: Method.GET,
            subscription: "/getCurrentUser",
            onValidation: ({ res, user }) => res.send(JSON.stringify(user)),
            onUnauthenticated: ({ res }) => res.send(JSON.stringify({ id: "__guest__", email: "" }))
        });

        register({
            method: Method.GET,
            subscription: "/whosOnline",
            onValidation: ({ res }) => {
                let users: any = { active: {}, inactive: {} };
                const now = Date.now();

                const { timeMap } = WebSocket;
                for (const user in timeMap) {
                    const time = timeMap[user];
                    const key = ((now - time) / 1000) < (60 * 5) ? "active" : "inactive";
                    users[key][user] = `Last active ${msToTime(now - time)} ago`;
                }

                res.send(users);
            }
        });

    }

}

function msToTime(duration: number) {
    let milliseconds = Math.floor((duration % 1000) / 100),
        seconds = Math.floor((duration / 1000) % 60),
        minutes = Math.floor((duration / (1000 * 60)) % 60),
        hours = Math.floor((duration / (1000 * 60 * 60)) % 24);

    let hoursS = (hours < 10) ? "0" + hours : hours;
    let minutesS = (minutes < 10) ? "0" + minutes : minutes;
    let secondsS = (seconds < 10) ? "0" + seconds : seconds;

    return hoursS + ":" + minutesS + ":" + secondsS + "." + milliseconds;
}