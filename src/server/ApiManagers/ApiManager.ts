import RouteManager from "../RouteManager";

export default abstract class ApiManager {

    public abstract register(router: RouteManager): void;

}