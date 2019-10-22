import ApiManager from "./ApiManager";
import RouteManager, { Method } from "../RouteManager";
import { WebSocket } from "../Websocket/Websocket";

export default class UserManager extends ApiManager {

    public register(router: RouteManager): void {
        router.addSupervisedRoute({
            method: Method.GET,
            subscription: "/whosOnline",
            onValidation: ({ res }) => {
                let users: any = { active: {}, inactive: {} };
                const now = Date.now();

                const { timeMap } = WebSocket;
                for (const user in timeMap) {
                    const time = timeMap[user];
                    const key = ((now - time) / 1000) < (60 * 5) ? "active" : "inactive";
                    users[key][user] = `Last active ${this.msToTime(now - time)} ago`;
                }

                res.send(users);
            }
        });
    }

    private msToTime(duration: number) {
        let milliseconds = Math.floor((duration % 1000) / 100),
            seconds = Math.floor((duration / 1000) % 60),
            minutes = Math.floor((duration / (1000 * 60)) % 60),
            hours = Math.floor((duration / (1000 * 60 * 60)) % 24);

        let hoursS = (hours < 10) ? "0" + hours : hours;
        let minutesS = (minutes < 10) ? "0" + minutes : minutes;
        let secondsS = (seconds < 10) ? "0" + seconds : seconds;

        return hoursS + ":" + minutesS + ":" + secondsS + "." + milliseconds;
    }

}