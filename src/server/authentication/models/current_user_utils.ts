import { DashUserModel } from "./user_model";
import * as request from 'request'
import { RouteStore } from "../../RouteStore";
import { ServerUtils } from "../../ServerUtil";

export class CurrentUserUtils {
    private static curr_email: string;
    private static curr_id: string;

    public static get email() {
        return CurrentUserUtils.curr_email;
    }

    public static get id() {
        return CurrentUserUtils.curr_id;
    }

    public static loadCurrentUser() {
        request.get(ServerUtils.prepend(RouteStore.getCurrUser), (error, response, body) => {
            if (body) {
                let obj = JSON.parse(body);
                CurrentUserUtils.curr_id = obj.id as string;
                CurrentUserUtils.curr_email = obj.email as string;
            } else {
                throw new Error("There should be a user! Why does Dash think there isn't one?")
            }
        });
    }
}