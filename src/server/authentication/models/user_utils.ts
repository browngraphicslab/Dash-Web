import { DashUserModel } from "./user_model";
import * as request from 'request'
import { RouteStore } from "../../RouteStore";
import { ServerUtils } from "../../ServerUtil";

export class UserUtils {
    private static current: string;

    public static get currentUserId() {
        return UserUtils.current;
    }

    public static loadCurrentUserId() {
        request.get(ServerUtils.prepend(RouteStore.getCurrUser), (error, response, body) => {
            if (body) {
                UserUtils.current = JSON.parse(body) as string;
            } else {
                throw new Error("There should be a user! Why does Dash think there isn't one?")
            }
        });
    }
}