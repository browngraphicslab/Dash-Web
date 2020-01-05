import ApiManager, { Registration } from "./ApiManager";
import { Method } from "../RouteManager";
import { Database } from "../database";
import { msToTime } from "../ActionUtilities";

export const timeMap: { [id: string]: number } = {};
interface ActivityUnit {
    user: string;
    duration: number;
}

export default class UserManager extends ApiManager {

    protected initialize(register: Registration): void {

        register({
            method: Method.GET,
            subscription: "/getUsers",
            secureHandler: async ({ res }) => {
                const cursor = await Database.Instance.query({}, { email: 1, userDocumentId: 1 }, "users");
                const results = await cursor.toArray();
                res.send(results.map(user => ({ email: user.email, userDocumentId: user.userDocumentId })));
            }
        });

        register({
            method: Method.GET,
            subscription: "/getUserDocumentId",
            secureHandler: ({ res, user }) => res.send(user.userDocumentId)
        });

        register({
            method: Method.GET,
            subscription: "/getCurrentUser",
            secureHandler: ({ res, user }) => res.send(JSON.stringify(user)),
            publicHandler: ({ res }) => res.send(JSON.stringify({ id: "__guest__", email: "" }))
        });

        register({
            method: Method.GET,
            subscription: "/activity",
            secureHandler: ({ res }) => {
                const now = Date.now();

                const activeTimes: ActivityUnit[] = [];
                const inactiveTimes: ActivityUnit[] = [];

                for (const user in timeMap) {
                    const time = timeMap[user];
                    const duration = now - time;
                    const target = (duration / 1000) < (60 * 5) ? activeTimes : inactiveTimes;
                    target.push({ user, duration });
                }

                const process = (target: { user: string, duration: number }[]) => {
                    const comparator = (first: ActivityUnit, second: ActivityUnit) => first.duration - second.duration;
                    const sorted = target.sort(comparator);
                    return sorted.map(({ user, duration }) => `${user} (${msToTime(duration)})`);
                };

                res.render("user_activity.pug", {
                    title: "User Activity",
                    active: process(activeTimes),
                    inactive: process(inactiveTimes)
                });
            }
        });

    }

}