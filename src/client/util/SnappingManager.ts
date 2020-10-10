import { observable, action, runInAction } from "mobx";

export namespace SnappingManager {

    class Manager {
        @observable IsDragging: boolean = false;
        @observable public horizSnapLines: number[] = [];
        @observable public vertSnapLines: number[] = [];
        @action public clearSnapLines() {
            this.vertSnapLines = [];
            this.horizSnapLines = [];
        }
        @action public setSnapLines(horizLines: number[], vertLines: number[]) {
            this.horizSnapLines = horizLines;
            this.vertSnapLines = vertLines;
        }

        @observable cachedGroups: string[] = [];
        @action setCachedGroups(groups: string[]) { this.cachedGroups = groups; }
    }

    const manager = new Manager();

    export function clearSnapLines() { manager.clearSnapLines(); }
    export function setSnapLines(horizLines: number[], vertLines: number[]) { manager.setSnapLines(horizLines, vertLines); }
    export function horizSnapLines() { return manager.horizSnapLines; }
    export function vertSnapLines() { return manager.vertSnapLines; }

    export function SetIsDragging(dragging: boolean) { runInAction(() => manager.IsDragging = dragging); }
    export function GetIsDragging() { return manager.IsDragging; }

    /// bcz; argh!! TODO;   These do not belong here, but there were include order problems with leaving them in util.ts
    // need to investigate further what caused the mobx update problems and move to a better location.
    export function SetCachedGroups(groups: string[]) { manager.setCachedGroups(groups); }
    export function GetCachedGroups() { return manager.cachedGroups; }
}

