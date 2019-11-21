import RouteManager, { RouteInitializer } from "../RouteManager";

export type Registration = (initializer: RouteInitializer) => void;

export default abstract class ApiManager {
    protected abstract initialize(register: Registration): void;

    public register(register: Registration) {
        this.initialize(register);
    }
}