import ApiManager, { Registration } from "./ApiManager";
import { Method } from "../RouteManager";
import { Database } from "../database";
import { msToTime } from "../ActionUtilities";
import * as bcrypt from "bcrypt-nodejs";
import { Opt } from "../../new_fields/Doc";

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
            secureHandler: ({ res, user: { _id, email } }) => res.send(JSON.stringify({ id: _id, email })),
            publicHandler: ({ res }) => res.send(JSON.stringify({ id: "__guest__", email: "" }))
        });

        register({
            method: Method.POST,
            subscription: '/internalResetPassword',
            secureHandler: async ({ user, req, res }) => {
                const result: any = {};
                const { curr_pass, new_pass, new_confirm } = req.body;
                // perhaps should assert whether curr password is entered correctly
                const validated = await new Promise<Opt<boolean>>(resolve => {
                    bcrypt.compare(curr_pass, user.password, (err, passwords_match) => {
                        if (err || !passwords_match) {
                            result.error = [{ msg: "Incorrect current password" }];
                            res.send(result);
                            resolve(undefined);
                        } else {
                            resolve(passwords_match);
                        }
                    });
                });

                if (validated === undefined) {
                    return;
                }

                req.assert("new_pass", "Password must be at least 4 characters long").len({ min: 4 });
                req.assert("new_confirm", "Passwords do not match").equals(new_pass);
                if (curr_pass === new_pass) {
                    result.error = [{ msg: "Current and new password are the same" }];
                }
                // was there error in validating new passwords?
                if (req.validationErrors()) {
                    // was there error?
                    result.error = req.validationErrors();
                }

                // will only change password if there are no errors.
                if (!result.error) {
                    user.password = new_pass;
                    user.passwordResetToken = undefined;
                    user.passwordResetExpires = undefined;
                }

                user.save(err => {
                    if (err) {
                        result.error = [{ msg: "Error while saving new password" }];
                    }
                });

                res.send(result);
            }
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