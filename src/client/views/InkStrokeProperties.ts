import { action, computed, observable } from "mobx";
import { ColorState } from 'react-color';
import { Doc, Field, Opt } from "../../fields/Doc";
import { Document } from "../../fields/documentSchemas";
import { InkField, InkData } from "../../fields/InkField";
import { Cast, NumCast } from "../../fields/Types";
import { DocumentType } from "../documents/DocumentTypes";
import { SelectionManager } from "../util/SelectionManager";
import { undoBatch } from "../util/UndoManager";
import { bool } from "sharp";

export class InkStrokeProperties {
    static Instance: InkStrokeProperties | undefined;

    private _lastFill = "#D0021B";
    private _lastLine = "#D0021B";
    private _lastDash = "2";
    private _inkDocs: { x: number, y: number, width: number, height: number }[] = [];

    @observable _lock = false;
    @observable _controlBtn = false;
    @observable _currPoint = -1;

    getField(key: string) {
        return this.selectedInk?.reduce((p, i) =>
            (p === undefined || (p && p === i.rootDoc[key])) && i.rootDoc[key] !== "0" ? Field.toString(i.rootDoc[key] as Field) : "", undefined as Opt<string>);
    }

    @computed get selectedInk() {
        const inks = SelectionManager.Views().filter(i => Document(i.rootDoc).type === DocumentType.INK);
        return inks.length ? inks : undefined;
    }
    @computed get unFilled() { return this.selectedInk?.reduce((p, i) => p && !i.rootDoc.fillColor ? true : false, true) || false; }
    @computed get unStrokd() { return this.selectedInk?.reduce((p, i) => p && !i.rootDoc.color ? true : false, true) || false; }
    @computed get solidFil() { return this.selectedInk?.reduce((p, i) => p && i.rootDoc.fillColor ? true : false, true) || false; }
    @computed get solidStk() { return this.selectedInk?.reduce((p, i) => p && i.rootDoc.color && (!i.rootDoc.strokeDash || i.rootDoc.strokeDash === "0") ? true : false, true) || false; }
    @computed get dashdStk() { return !this.unStrokd && this.getField("strokeDash") || ""; }
    @computed get colorFil() { const ccol = this.getField("fillColor") || ""; ccol && (this._lastFill = ccol); return ccol; }
    @computed get colorStk() { const ccol = this.getField("color") || ""; ccol && (this._lastLine = ccol); return ccol; }
    @computed get widthStk() { return this.getField("strokeWidth") || "1"; }
    @computed get markHead() { return this.getField("strokeStartMarker") || ""; }
    @computed get markTail() { return this.getField("strokeEndMarker") || ""; }
    @computed get shapeHgt() { return this.getField("_height"); }
    @computed get shapeWid() { return this.getField("_width"); }
    @computed get shapeXps() { return this.getField("x"); }
    @computed get shapeYps() { return this.getField("y"); }
    @computed get shapeRot() { return this.getField("rotation"); }
    set unFilled(value) { this.colorFil = value ? "" : this._lastFill; }
    set solidFil(value) { this.unFilled = !value; }
    set colorFil(value) { value && (this._lastFill = value); this.selectedInk?.forEach(i => i.rootDoc.fillColor = value ? value : undefined); }
    set colorStk(value) { value && (this._lastLine = value); this.selectedInk?.forEach(i => i.rootDoc.color = value ? value : undefined); }
    set markHead(value) { this.selectedInk?.forEach(i => i.rootDoc.strokeStartMarker = value); }
    set markTail(value) { this.selectedInk?.forEach(i => i.rootDoc.strokeEndMarker = value); }
    set unStrokd(value) { this.colorStk = value ? "" : this._lastLine; }
    set solidStk(value) { this.dashdStk = ""; this.unStrokd = !value; }
    set dashdStk(value) {
        value && (this._lastDash = value) && (this.unStrokd = false);
        this.selectedInk?.forEach(i => i.rootDoc.strokeDash = value ? this._lastDash : undefined);
    }
    set shapeXps(value) { this.selectedInk?.forEach(i => i.rootDoc.x = Number(value)); }
    set shapeYps(value) { this.selectedInk?.forEach(i => i.rootDoc.y = Number(value)); }
    set shapeRot(value) { this.selectedInk?.forEach(i => i.rootDoc.rotation = Number(value)); }
    set widthStk(value) { this.selectedInk?.forEach(i => i.rootDoc.strokeWidth = Number(value)); }
    set shapeWid(value) {
        this.selectedInk?.filter(i => i.rootDoc._width && i.rootDoc._height).forEach(i => {
            const oldWidth = NumCast(i.rootDoc._width);
            i.rootDoc._width = Number(value);
            this._lock && (i.rootDoc._height = (i.rootDoc._width * NumCast(i.rootDoc._height)) / oldWidth);
        });
    }
    set shapeHgt(value) {
        this.selectedInk?.filter(i => i.rootDoc._width && i.rootDoc._height).forEach(i => {
            const oldHeight = NumCast(i.rootDoc._height);
            i.rootDoc._height = Number(value);
            this._lock && (i.rootDoc._width = (i.rootDoc._height * NumCast(i.rootDoc._width)) / oldHeight);
        });
    }

    constructor() {
        InkStrokeProperties.Instance = this;
    }

    @undoBatch
    @action
    addPoints = (x: number, y: number, pts: { X: number, Y: number }[], index: number, control: { X: number, Y: number }[]) => {
        this.selectedInk?.forEach(action(inkView => {
            if (this.selectedInk?.length === 1) {
                const doc = Document(inkView.rootDoc);
                if (doc.type === DocumentType.INK) {
                    const ink = Cast(doc.data, InkField)?.inkData;
                    if (ink) {
                        const newPoints: { X: number, Y: number }[] = [];
                        var counter = 0;
                        for (var k = 0; k < index; k++) {
                            control.forEach(pt => (pts[k].X === pt.X && pts[k].Y === pt.Y) && counter++);
                        }
                        //decide where to put the new coordinate
                        const spNum = Math.floor(counter / 2) * 4 + 2;

                        for (var i = 0; i < spNum; i++) {
                            ink[i] && newPoints.push({ X: ink[i].X, Y: ink[i].Y });
                        }
                        for (var j = 0; j < 4; j++) {
                            newPoints.push({ X: x, Y: y });

                        }
                        for (var i = spNum; i < ink.length; i++) {
                            newPoints.push({ X: ink[i].X, Y: ink[i].Y });
                        }
                        this._currPoint = -1;
                        Doc.GetProto(doc).data = new InkField(newPoints);
                    }
                }
            }
        }));
    }

    applyFunction = (func: (doc: Doc, ink: InkData, ptsXscale: number, ptsYscale: number) => { X: number, Y: number }[], requireCurrPoint: boolean = false) => {
        var appliedFunc = false;
        this.selectedInk?.forEach(action(inkView => {
            if (this.selectedInk?.length === 1 && (!requireCurrPoint || this._currPoint !== -1)) {
                const doc = Document(inkView.rootDoc);
                if (doc.type === DocumentType.INK && doc.width && doc.height) {
                    const ink = Cast(doc.data, InkField)?.inkData;
                    if (ink) {
                        const oldXrange = (xs => ({ coord: NumCast(doc.x), min: Math.min(...xs), max: Math.max(...xs) }))(ink.map(p => p.X));
                        const oldYrange = (ys => ({ coord: NumCast(doc.y), min: Math.min(...ys), max: Math.max(...ys) }))(ink.map(p => p.Y));
                        const ptsXscale = NumCast(doc._width) / (oldXrange.max - oldXrange.min);
                        const ptsYscale = NumCast(doc._height) / (oldYrange.max - oldYrange.min);
                        const newPoints = func(doc, ink, ptsXscale, ptsYscale);
                        const newXrange = (xs => ({ min: Math.min(...xs), max: Math.max(...xs) }))(newPoints.map(p => p.X));
                        const newYrange = (ys => ({ min: Math.min(...ys), max: Math.max(...ys) }))(newPoints.map(p => p.Y));
                        doc._width = (newXrange.max - newXrange.min) * ptsXscale;
                        doc._height = (newYrange.max - newYrange.min) * ptsYscale;
                        doc.x = (oldXrange.coord + (newXrange.min - oldXrange.min) * ptsXscale);
                        doc.y = (oldYrange.coord + (newYrange.min - oldYrange.min) * ptsYscale);
                        Doc.GetProto(doc).data = new InkField(newPoints);
                        appliedFunc = true;
                    }
                }
            }
        }));
        return appliedFunc;
    }

    @undoBatch
    @action
    deletePoints = () => this.applyFunction((doc: Doc, ink: InkData) => {
        var newPoints: { X: number, Y: number }[] = [];
        const toRemove = Math.floor(((this._currPoint + 2) / 4));
        for (var i = 0; i < ink.length; i++) {
            if (Math.floor((i + 2) / 4) !== toRemove && (toRemove !== 0 || i > 3)) {
                newPoints.push({ X: ink[i].X, Y: ink[i].Y });
            }
        }
        this._currPoint = -1;
        Doc.GetProto(doc).data = new InkField(newPoints);
        if (newPoints.length === 4) {
            const newerPoints: { X: number, Y: number }[] = [];
            newerPoints.push({ X: newPoints[0].X, Y: newPoints[0].Y });
            newerPoints.push({ X: newPoints[0].X, Y: newPoints[0].Y });
            newerPoints.push({ X: newPoints[3].X, Y: newPoints[3].Y });
            newerPoints.push({ X: newPoints[3].X, Y: newPoints[3].Y });
            return newerPoints;
        }
        return newPoints;
    }, true);

    @undoBatch
    @action
    rotate = (angle: number) => {
        this.applyFunction((doc: Doc, ink: InkData, ptsXscale: number, ptsYscale: number) => {
            const oldXrange = (xs => ({ coord: NumCast(doc.x), min: Math.min(...xs), max: Math.max(...xs) }))(ink.map(p => p.X));
            const oldYrange = (ys => ({ coord: NumCast(doc.y), min: Math.min(...ys), max: Math.max(...ys) }))(ink.map(p => p.Y));
            const centerPoint = { X: (oldXrange.min + oldXrange.max) / 2, Y: (oldYrange.min + oldYrange.max) / 2 };
            const newPoints: { X: number, Y: number }[] = [];
            ink.map(i => ({ X: i.X - centerPoint.X, Y: i.Y - centerPoint.Y })).forEach(i => {
                const newX = Math.cos(angle) * i.X - Math.sin(angle) * i.Y;
                const newY = Math.sin(angle) * i.X + Math.cos(angle) * i.Y;
                newPoints.push({ X: newX + centerPoint.X, Y: newY + centerPoint.Y });
            });
            doc.rotation = NumCast(doc.rotation) + angle;
            return newPoints;
        });
    }

    @undoBatch
    @action
    control = (xDiff: number, yDiff: number, controlNum: number) =>
        this.applyFunction((doc: Doc, ink: InkData, ptsXscale: number, ptsYscale: number) => {
            const newPoints: { X: number, Y: number }[] = [];
            const order = controlNum % 4;
            for (var i = 0; i < ink.length; i++) {
                newPoints.push(
                    (controlNum === i ||
                        (order === 0 && i === controlNum + 1) ||
                        (order === 0 && controlNum !== 0 && i === controlNum - 2) ||
                        (order === 0 && controlNum !== 0 && i === controlNum - 1) ||
                        (order === 3 && i === controlNum - 1) ||
                        (order === 3 && controlNum !== ink.length - 1 && i === controlNum + 1) ||
                        (order === 3 && controlNum !== ink.length - 1 && i === controlNum + 2) ||
                        ((ink[0].X === ink[ink.length - 1].X) && (ink[0].Y === ink[ink.length - 1].Y) && (i === 0 || i === ink.length - 1) && (controlNum === 0 || controlNum === ink.length - 1))
                    ) ?
                        { X: ink[i].X - xDiff / ptsXscale, Y: ink[i].Y - yDiff / ptsYscale } :
                        { X: ink[i].X, Y: ink[i].Y });
            }
            return newPoints;
        });

    @undoBatch
    @action
    switchStk = (color: ColorState) => {
        const val = String(color.hex);
        this.colorStk = val;
        return true;
    }

    @undoBatch
    @action
    switchFil = (color: ColorState) => {
        const val = String(color.hex);
        this.colorFil = val;
        return true;
    }
}