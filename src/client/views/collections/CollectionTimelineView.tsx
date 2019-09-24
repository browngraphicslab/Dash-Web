import React = require("react");
import { observer } from "mobx-react";
import { action, computed, observable, untracked, runInAction, IReactionDisposer, reaction, isObservableArray, } from "mobx";
import { Doc, DocListCast, Field, FieldResult, DocListCastAsync, Opt, HeightSym, WidthSym, } from "../../../new_fields/Doc";
import { NumCast, Cast, StrCast, BoolCast } from "../../../new_fields/Types";
import { emptyFunction, Utils, returnOne, returnEmptyString } from "../../../Utils";
import { SelectionManager } from "../../util/SelectionManager";
import { DocumentView } from "../nodes/DocumentView";
import "./CollectionTimelineView.scss";
import { CollectionSubView, SubCollectionViewProps } from "./CollectionSubView";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { DateField } from "../../../new_fields/DateField";
import { List } from "../../../new_fields/List";
import { Transform } from "../../util/Transform";
import { faFilePdf, faFilm, faFont, faGlobeAsia, faImage, faMusic, faObjectGroup, faBell } from '@fortawesome/free-solid-svg-icons';
import { RichTextField, ToPlainText, FromPlainText } from "../../../new_fields/RichTextField";
import { ImageField, VideoField, AudioField, PdfField, WebField } from "../../../new_fields/URLField";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { Docs, DocUtils } from "../../documents/Documents";
import { ProxyField } from "../../../new_fields/Proxy";
import Measure from "react-measure";
import { EditableView } from "../EditableView";
import { listSpec } from "../../../new_fields/Schema";
import { anchorPoints, Flyout } from "../DocumentDecorations";
import { Thumbnail, NodeProps } from "./CollectionTimeLineViewNode";
import { undoBatch, UndoManager } from "../../util/UndoManager";
import { thisExpression } from "babel-types";


type DocTuple = {
    doc: Doc,
    value: any,
};

type MarkerUnit = {
    document: Doc,
    element: JSX.Element,
    ref: HTMLDivElement | undefined,
    map: JSX.Element,
    mapref: HTMLDivElement | undefined;
    linkedthumbnail: Node | undefined;
};

type Node = {
    doc: Doc;
    leftval: number;
    top: number;
    mapleft: number;
    row: number;
};


@observer
export class CollectionTimelineView extends CollectionSubView(doc => doc) {
    private screenref = React.createRef<HTMLDivElement>();
    private barref = React.createRef<HTMLDivElement>();
    private timelineref = React.createRef<HTMLDivElement>();
    private sortReactionDisposer: IReactionDisposer | undefined;
    @observable private types: boolean[] = [];
    @observable pendingThumbnailRefCount = 0;
    private marqueeref = React.createRef<HTMLDivElement>();


    @computed
    private get markerDocs() {
        let stored = Cast(this.props.Document.markers, listSpec(Doc));
        if (!stored) {
            this.props.Document.markers = stored = new List<Doc>();
        }
        return stored;
    }

    constructor(props: SubCollectionViewProps) {
        super(props);
    }

    componentWillMount() {
        runInAction(() => {
            for (let i = 0; i < this.filtered.length; i++) {
                this.types[i] = true;
            }
        });
        this.initializeMarkers();
    }

    componentWillUnmount() {
        this.sortReactionDisposer && this.sortReactionDisposer();
    }


    @action
    initializeMarkers = async () => {
        let markers = this.markerDocs;
        for (let marker of markers) {
            let doc = await marker;
            let markerUnit = { document: doc, ref: undefined, mapref: undefined } as MarkerUnit;
            markerUnit.element = (<div>

                < div ref={(el) => el ? markerUnit.ref = el : null} onPointerDown={(e) => this.onPointerDown_DeleteMarker(e, String(markerUnit.document.annotation), markerUnit)}
                    style={{
                        top: "71%", border: "2px solid" + (markerUnit.document.color),
                        width: "10px", height: "30px", backgroundColor: String(markerUnit.document.color), opacity: 0.5, position: "fixed", left: 0,
                    }}>
                </div></div>);
            markerUnit.map = <div className="ugh" ref={(el) => el ? markerUnit.mapref = el : null}
                style={{
                    position: "absolute",
                    background: String(markerUnit.document.color),
                    zIndex: 1,
                    top: "80%",
                    left: NumCast(doc.initialMapLeft),
                    width: NumCast(doc.initialMapWidth),
                    border: "3px solid" + String(markerUnit.document.color)
                }}></div>;
        }
    }

    @action
    onPointerMove_LeftResize = (e: PointerEvent): void => {
        e.stopPropagation();
        this.markdoc!.initialLeft = NumCast(this.markdoc!.initialLeft) + e.movementX;
        this.markdoc!.initialWidth = NumCast(this.markdoc!.initialWidth) - e.movementX;
        document.addEventListener("pointerup", this.onPointerUp);
    }

    @observable markdoc: Doc | undefined = undefined;
    @action
    onPointerDown_LeftResize = (e: React.PointerEvent, doc: Doc): void => {
        if (e.button===2) {
            this.markerDocs.splice(this.markerDocs.indexOf(markerUnit.document), 1);
            this.selectedMarker = undefined;
              e.preventDefault();
            e.stopPropagation();
        }
        else {
        document.addEventListener("pointermove", (this.onPointerMove_LeftResize));
        e.stopPropagation();
        this.markdoc = doc;
        this.downbool = (false);
        }
    }

    @action
    onPointerMove_RightResize = (e: PointerEvent): void => {
        
        e.stopPropagation();
        this.markdoc!.initialWidth = NumCast(this.markdoc!.initialWidth) + e.movementX;
        document.addEventListener("pointerup", this.onPointerUp);
        
    }

    @action
    onPointerDown_RightResize = (e: React.PointerEvent, doc: Doc): void => {
           if (e.button===2) {
            this.markerDocs.splice(this.markerDocs.indexOf(markerUnit.document), 1);
            this.selectedMarker = undefined;
  e.preventDefault();
            e.stopPropagation();
        }
        else{
        document.addEventListener("pointermove", (this.onPointerMove_RightResize));
        e.stopPropagation();
        this.markdoc = doc;
        this.downbool = (false);
        }
    }

    createmarker = (doc: Doc): JSX.Element | undefined => {
        let markerUnit = { document: doc, ref: undefined, mapref: undefined } as MarkerUnit;
        markerUnit.element = (  
            < div ref={(el) => el ? markerUnit.ref = el : null} onDoubleClick={(e) => this.doubleclick(e, markerUnit)} onPointerDown={(e) => this.onPointerDown_DeleteMarker(e, String(markerUnit.document.annotation), markerUnit)}
                style={{
                    border: "2px solid" + String(markerUnit.document.color),
                    top: this.rowval[Math.round(this.rowval.length / 2)],
                    width: NumCast(doc.initialWidth), height: this.rowscale, backgroundColor: String(markerUnit.document.color), zIndex: 5, opacity: 0.5, padding: "2px",
                    position: "absolute", left: NumCast(doc.initialLeft),
                }}>
                <div onPointerDown={(e) => this.onPointerDown_LeftResize(e, doc)} style={{ position:"absolute", width:"10px", cursor: "ew-resize", zIndex: 100, height: "100%" }}></div>
                <EditableView
                    contents={doc.annotation}
                    SetValue={this.annotationUpdate}
                    GetValue={() => ""}
                    display={"inline"}
                    height={30}
                    oneLine={true}
                />
                <div onPointerDown={(e) => this.onPointerDown_RightResize(e, doc)} style={{position:"absolute", left:NumCast(doc.initialWidth), width:"10px", cursor: "ew-resize", zIndex: 100, height: "100%" }}></div>
            </div>);
        if (markerUnit.document.sortstate === this.sortstate) {
            return markerUnit.element;
        }
        return undefined;
    }

    createmap = (doc: Doc) => {
        let map = <div
            style={{
                position: "absolute",
                background: String(doc.color),
                zIndex: 90,
                top: "80%",
                left: NumCast(doc.initialMapLeft),
                width: NumCast(doc.initialMapWidth),
                border: "3px solid" + String(doc.color)
            }}></div>;
        return map;
    }

    @action
    resetSelections() {
        this.selections = [];
        for (let thumbnail of this.thumbnails) {
            //this.unfocus(thumbnail.thumbnailref, thumbnail.headerref);
        }
    }

    private filterbuttons: JSX.Element[] = [];

    filtermenu() {
        let childDocs = DocListCast(this.props.Document.data);
        let types = new Set<string>();
        childDocs.map(doc => {
            let data = doc.data;
            if (!data) {
                return;
            }
            let type: string | undefined;
            if (data instanceof Promise) {
                data.then(field => {
                    field && (type = this.inferType(field)) && types.add(type);
                });
            } else {
                (type = this.inferType(data)) && types.add(type);
            }
        });

        let existingTypes = Array.from(types);
        this.filterbuttons = [];

        for (let i = 0; i < existingTypes.length; i++) {
            let doc = existingTypes[i];
            let button = React.createRef<HTMLInputElement>();
            this.filterbuttons.push(
                <div><input ref={button} type="checkbox" checked={this.types[i]} onChange={() => this.toggleFilter(doc, i, button)} />{doc}</div>);
        }
    }

    @action
    toggleFilter = (key: string, i: number, button: React.RefObject<HTMLInputElement>) => {
        if (this.filtered.includes(key)) {
            this.filtered.splice(this.filtered.indexOf(key), 1);
        }
        else {
            this.filtered.push(key);
        }
        this.types[i] = button.current!.checked;
        this.resetSelections();
    }

    // @action
    // select(e: React.MouseEvent<HTMLDivElement>, d: Doc, b: HTMLDivElement | undefined) {
    //     var thumbnail = undefined;
    //     var header = undefined;
    //     for (let thumbnails of this.thumbnails) {
    //         if (thumbnails.thumbnailref === b) {
    //             thumbnail = (thumbnails.thumbnailref);
    //             //header = thumbnails.headerref;
    //         }
    //     }
    //     if (e.ctrlKey) {
    //         if (thumbnail!.classList.contains("selected")) {
    //             //this.unfocus(thumbnail, header);
    //             for (let i = 0; i < this.selections.length; i++) {
    //                 if (this.selections[i] === thumbnail) {
    //                     this.selections.splice(i, 1);
    //                 }
    //             }
    //         }
    //         else {
    //             //this.focus(thumbnail, header);
    //             this.selections.push(thumbnail);
    //         }
    //     }
    //     else {
    //         this.selections = [];
    //         for (let thumbnails of this.thumbnails) {
    //             //this.unfocus(thumbnails.thumbnailref, thumbnails.headerref);
    //         }
    //         if (!thumbnail!.classList.contains("selected")) {
    //             //this.focus(thumbnail, header);
    //             this.selections.push(thumbnail);
    //         }
    //     }
    // }


    @observable private filtered: String[] = ["Audio", "Pdf", "Text", "Image", "Video", "Web", "Misc"];
    private selections: (HTMLDivElement | undefined)[] = [];
    @observable _lastX: number = 0;
    @observable _lastY: number = 0;
    @observable _downX: number = 0;
    @observable _downY: number = 0;
    @observable _visible: boolean = false;

    @action
    markerrender() {
        let markers = DocListCast(this.markerDocs);
        markers.forEach(doc => {
            let newscale = (this.barwidth / (this.barwidth - this.rightbound - this.leftbound));
            doc.initialLeft = (NumCast(doc.initialLeft) * newscale / NumCast(doc.initialScale)) - newscale * (this.leftbound - NumCast(doc.initialX));
            doc.initialX = this.leftbound;
            doc.initialWidth = (NumCast(doc.initialWidth) * newscale / NumCast(doc.initialScale));
            doc.initialScale = newscale;
        });
    }


    @action
    onPointerDown_DeleteMarker = (e: React.PointerEvent, annotation: string, markerUnit: MarkerUnit): void => {
        this.downbool = false;

        if (e.button===2) {
            this.markerDocs.splice(this.markerDocs.indexOf(markerUnit.document), 1);
            this.selectedMarker = undefined;
            e.preventDefault();
            e.stopPropagation();
        }
        else {
             e.preventDefault();
            e.stopPropagation();
            this.selectedMarker ? this.selectedMarker.ref!.style.opacity = "0.5" : null;
            this.selectedMarker ? this.selectedMarker.ref!.style.border = "0px solid black" : null;
            this.selectedMarker = markerUnit;
            this.selectedMarker.ref!.style.opacity = "0.9";
            this.selectedMarker.ref!.style.border = "1px solid black";
            this.selectedMarker.ref!.style.borderStyle = "dashed";
            this.selectedMarker.ref!.style.backgroundColor ? this.props.Document.selectedColor = this.selectedMarker.ref!.style.backgroundColor : null;
        }

    }

    @action
    doubleclick(e: React.MouseEvent, markerUnit: MarkerUnit) {
        if (markerUnit.ref!.style.border === "1px dashed black") {
            this.leftbound = NumCast(markerUnit.document.initialMapLeft);
            this.rightbound = this.barwidth - NumCast(markerUnit.document.initialMapWidth) - this.leftbound;
        }
        this.markerrender();
    }

    private preventbug: boolean = false;

    onPointerMove_Selector = async (e: PointerEvent) => {
        let doc = await this.markerDocs[this.markerDocs.length - 1];
        if (this.preventbug) {
            let newX = NumCast(doc.initialWidth);
            let newX2 = NumCast(doc.initialMapWidth);
            let newmapwidth = newX2 + e.movementX / (this.barwidth / (this.barwidth - this.rightbound - this.leftbound));
            let newwidth = newX + e.movementX;
            let leftval = NumCast(doc.initialLeft) + newwidth;
            let mintick: React.RefObject<HTMLDivElement>;
            let minticknum = Infinity;
            for (let ticks of this.tickrefs) {
                if (ticks.current !== null) {
                    ticks.current!.classList.remove("hover");
                    if (Math.abs(leftval - parseFloat(ticks.current.style.left!)) < minticknum) {
                        minticknum = Math.abs(leftval - parseFloat(ticks!.current.style.left!));
                        mintick = ticks;
                    }
                }
            }
            mintick!.current!.classList.add("hover");
            doc.initialWidth = newwidth;
            doc.initialMapWidth = newmapwidth;
        }
    }

    @action
    onPointerUp_Selector = async (e: PointerEvent) => {
        this.downbool = true;
        
        document.removeEventListener("pointermove", this.onPointerMove_Selector, true);
        let mintick: React.RefObject<HTMLDivElement>;
        let minticknum = Infinity;
        let doc = await this.markerDocs[this.markerDocs.length - 1];
        let leftval = NumCast(doc.initialLeft) + NumCast(doc.initialWidth);
        for (let ticks of this.tickrefs) {
            if (ticks.current !== null) {
                ticks.current!.classList.remove("hover");

                if (Math.abs(leftval - parseFloat(ticks.current.style.left!)) < minticknum) {
                    minticknum = Math.abs(leftval - parseFloat(ticks!.current.style.left!));
                    mintick = ticks;
                }
            }
        }

        doc.initialWidth = parseFloat(mintick!.current!.style.left!) - NumCast(doc.initialLeft);
        if (doc.initialWidth === 0) {
            runInAction(() => this.markerDocs.pop());
        }
    }

    private _values: number[] = [];
    private ticks: JSX.Element[] = [];
    private thumbnails: Node[] = [];
    private filterDocs = (thumbnail: Node[]): Node[] => {
        let thumbnails = [];
        for (let oldthumbnail of thumbnail) {
            if (this.filtered.includes("Image")) { if (oldthumbnail.doc.data instanceof ImageField) { thumbnails.push(oldthumbnail); } }
            if (this.filtered.includes("Audio")) { if (oldthumbnail.doc.data instanceof AudioField) { thumbnails.push(oldthumbnail); } }
            if (this.filtered.includes("Pdf")) { if (oldthumbnail.doc.data instanceof PdfField) { thumbnails.push(oldthumbnail); } }
            if (this.filtered.includes("Text")) { if (oldthumbnail.doc.data instanceof RichTextField) { thumbnails.push(oldthumbnail); } }
            if (this.filtered.includes("Video")) { if (oldthumbnail.doc.data instanceof VideoField) { thumbnails.push(oldthumbnail); } }
            if (this.filtered.includes("Web")) { if (oldthumbnail.doc.data instanceof WebField) { thumbnails.push(oldthumbnail); } }
            else if (this.filtered.includes("Misc")) { thumbnails.push(oldthumbnail); }
        }
        return thumbnails;
    }

    private inferType = (data: FieldResult<Field>) => {
        if (!data) {
            return undefined;
        }
        switch (data.constructor) {
            case ImageField: return "Image";
            case AudioField: return "Audio";
            case PdfField: return "PDF";
            case RichTextField: return "Text";
            case VideoField: return "Video";
            case WebField: return "Image";
            case DateField: return "Date";
            case List: return "Collection";
            default:
                return undefined;
        }
    }

    thumbnailloop() {
        let arr: Doc[] = [];
        //Build an array of all nodes in dash document.
        this.childDocs.map((d) => { arr.push(d); });
        //filter based on selected sort criteria 
        let backup = arr.filter(doc => doc[this.sortstate]);

        let keyvalue: DocTuple[] = [];

        if (backup.length > 0) {
            if (this.sortstate === "creationDate") {
                keyvalue = backup.map(d => {
                    let vdate = Cast(d.creationDate, DateField) as DateField;
                    let value = new Date(vdate.date).getTime();
                    return { doc: d, value: value };
                });
            }
            else if (isNaN(parseFloat(String(backup[0][this.sortstate])))) {
                keyvalue = backup.map(d => {
                    let value = String(d[this.sortstate]);
                    return { doc: d, value: value };
                });
            }
            else {
                keyvalue = backup.map(d => {
                    let value = NumCast(d[this.sortstate]);
                    return { doc: d, value: value };
                });
            }
        }

        keyvalue.sort(function (a, b) { return (a.value - b.value); });
        let docs = keyvalue.map(kv => kv.doc);
        let values = keyvalue.map(kv => kv.value);
        this._range = (values[values.length - 1] - values[0]);
        if (this._range === 0) {
            this._range = values.length;
        }
        if (isNaN(this._range)) {
            this._range = values.length;
            for (let i = 0; i < values.length; i++) {
                values[i] = i;
            }
        }

        this._values = values;
        let leftval = "0";
        this.thumbnails = [];
        runInAction(() => this.pendingThumbnailRefCount = backup.length);
        for (let i = 0; i < backup.length; i++) {
            leftval = ((((this._range * 0.05) + values[i] - values[0]) * this.barwidth / (this._range * 1.1)) * (this.barwidth / (this.barwidth - this.rightbound - this.leftbound)) - (this.leftbound * (this.barwidth) / (this.barwidth - this.rightbound - this.leftbound))) + "px";
            let newNode = {
                mapleft: ((values[i] - values[0] + (this._range * 0.05)) * this.barwidth / (this._range * 1.1)), leftval: parseFloat(leftval), doc: docs[i], top: 20, row: Math.round(this.rows.length / 2) - 1,
            } as Node;
            this.thumbnails.push(newNode);
        }
        this.thumbnails = this.filterDocs(this.thumbnails);
        this.adjustY();
    }

    @action
    adjustY() {
        for (let thumbnail1 of this.thumbnails) {
            thumbnail1.row = Math.round(this.rows.length / 2) - 1;
        }
        let overlap = false;
        while (overlap === false) {
            overlap = true;
            let pos = true;
            let counter = 0;
            for (let thumbnail1 of this.thumbnails) {
                pos = true;
                counter = 0;
                for (let thumbnail2 of this.thumbnails) {
                    if (((thumbnail1.leftval >= thumbnail2.leftval && thumbnail1.leftval - this.rowscale < thumbnail2.leftval)
                        || (thumbnail1.leftval <= thumbnail2.leftval && thumbnail1.leftval + this.rowscale > thumbnail2.leftval))
                        && (thumbnail1.row === thumbnail2.row)
                        && thumbnail1 !== thumbnail2) {
                        // if (thumbnail1.row % 2 !== 0) {
                        //     let distance = Math.abs(thumbnail1.row - Math.round(this.rows.length / 2) - 1);
                        //     thumbnail1.row += 1 + distance;
                        // }
                        // else {
                        //     let distance = Math.abs(thumbnail1.row - Math.round(this.rows.length / 2) - 1);
                        //     thumbnail1.row -= (1 + distance);
                        // }
                        if (pos === true) {
                            counter++;
                            thumbnail2.row += counter;
                            pos = false;
                        }
                        else {
                            thumbnail2.row -= counter;
                            pos = true;
                        }

                        if (thumbnail1.row >= this.rows.length - 1) {
                            this.rowscale = this.rowscale * 0.8;
                        }
                        overlap = false;
                    }
                }
            }
            for (let thumbnail1 of this.thumbnails) {
                if (thumbnail1.row === Math.round(this.rows.length / 2)) {
                    thumbnail1.row++;
                    overlap = false;
                }
            }
        }
        // for (let thumbnail of this.thumbnails) {
        //     if (thumbnail.row >= this.rows.length) {
        //         this.rowscale = this.rowscale * 0.9;
        //     }
        // }
    }

    private tickrefs: React.RefObject<HTMLDivElement>[] = [];

    createticks() {
        //Creates the array of tick marks.
        let counter = 0;
        this.ticks = [];
        for (let i = 0; i < this.barwidth; i += this.barwidth / 1000) {
            let leftval = ((i * (this.barwidth / (this.barwidth - this.rightbound - this.leftbound)) - (this.leftbound * (this.barwidth) / (this.barwidth - this.rightbound - this.leftbound))) + "px");
            let tickref = React.createRef<HTMLDivElement>();
            this.tickrefs.push(tickref);
            if (counter % 100 === 0) {
                let val = Math.round(counter * this._range * 1.1 / 1000 + this._values[0] - this._range * 0.05);
                this.ticks.push(<div className="max" ref={tickref} style={{
                    position: "absolute", top: "0%", left: leftval, zIndex: -100, writingMode: "vertical-rl",
                    textOrientation: "mixed",
                }
                }> <div style={{ paddingTop: "10px" }}>{val}</div></div >);
            }
            else if (counter % 50 === 0) { this.ticks.push(<div className="max2" ref={tickref} style={{ position: "absolute", top: "0%", left: leftval, zIndex: -100 }} />); }
            else if (counter % 10 === 0) { this.ticks.push(<div className="active" ref={tickref} style={{ position: "absolute", top: "0%", left: leftval, zIndex: -100 }} />); }
            counter++;
        }
    }

    @action
    createRows() {
        this.rows = [];
        this.rowval = [];
        if (this.screenref.current) {
            this.windowheight = this.screenref.current.getBoundingClientRect().height - 40;
        }
        let border = "";
        this.rowPrev === true ? border = "1px black dashed" : null;
        for (let i = 0; i < this.windowheight; i
            += this.rowscale) {
            this.rows.push(<div onPointerDown={this.onPointerDown_AdjustScale} style={{ cursor: "n-resize", borderTop: border, height: "5px", position: "absolute", top: i, width: "100%", zIndex: 100 }} />);
            this.rowval.push(i);
        }
        this.rows.pop();
        this.rowval.pop();
    }



    private rows: JSX.Element[] = [];
    private rowval: number[] = [];

    @observable
    private windowheight: number = 700;

    @observable private rowscale: number = 50;

    @observable private selectedMarker: MarkerUnit | undefined;

    private get selectedColor() {
        let doc = this.props.Document;
        let color: string;
        if (doc.selectedColor) {
            color = StrCast(this.props.Document.selectedColor);
        } else {
            color = doc.selectedColor = "ffff80";
        }
        return color;
    }


    @action
    onPointerDown_AdjustScale = (e: React.PointerEvent<HTMLDivElement>): void => {
        this.downbool = false;

        document.addEventListener("pointermove", this.onPointerMove_AdjustScale);
        document.addEventListener("pointerup", this.onPointerUp_Dragger);
        e.stopPropagation();
        e.preventDefault();
    }


    @action
    onPointerMove_AdjustScale = (e: PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        let number = e.movementY;
        if (this.rowscale + number <= 40) {
            this.rowscale = 40;
        }
        else if (this.rowscale + number >= 100) {
            this.rowscale = 100;
        }
        else {
            this.rowscale += number;
        }
        document.addEventListener("pointerup", this.onPointerUp_Dragger);
    }

    private get leftbound() {
        let doc = this.props.Document;
        if (doc.leftbound) {

            return NumCast(doc.leftbound);
        } else {
            doc.leftbound = 0;
        }
        return NumCast(doc.leftbound);
    }

    private set leftbound(number) {
        this.props.Document.leftbound = number;
    }

    private get rightbound() {
        let doc = this.props.Document;
        if (doc.rightbound) {

            return NumCast(doc.rightbound);
        } else {
            doc.rightbound = 0;
        }
        return NumCast(doc.rightbound);
    }

    private set rightbound(number) {
        this.props.Document.rightbound = number;
    }


    private get barwidth() {
        let doc = this.props.Document;
        doc.barwidth = (this.barref.current ? this.barref.current.clientWidth : (952));
        return NumCast(doc.barwidth);
    }



    private set barwidth(number) {
        this.props.Document.barwidth = number;
    }

    private get sortstate() {
        let doc = this.props.Document;
        if (!doc.sortstate) {
            this.sortstate = "x";
        }
        return String(doc.sortstate);
    }

    private set rowPrev(boolean: boolean) {
        this.props.Document.rowPrev = boolean;
    }

    private get rowPrev() {
        let doc = this.props.Document;
        if (!doc.rowPrev) {
            this.rowPrev = false;
            console.log("hm");
        }
        return BoolCast(doc.rowPrev);
    }

    private set transtate(boolean: boolean) {
        this.props.Document.transtate = boolean;
    }

    private get transstate() {
        let doc = this.props.Document;
        if (!doc.transtate) {
            doc.transtate = false;
        }
        return BoolCast(doc.sortstate);
    }


    private set opac(boolean: boolean) {
        this.props.Document.opac = boolean;
    }

    private get opac() {
        let doc = this.props.Document;
        if (!doc.opac) {
            console.log("yu");
            this.opac = false;
        }
        return BoolCast(doc.opac);
    }


    private set sortstate(string) {
        this.props.Document.sortstate = string;
    }


    @action annotationUpdate = (newValue: string) => {
        this.selectedMarker!.document.annotation = newValue;
        return true;
    }


    private _range = 0;

    private get minvalue() {
        let doc = this.props.Document;
        return NumCast(doc.minvalue);
    }

    private set minvalue(number) {
        //this.props.Document.minvalue = this._values[0] - this._range * 0.05;
        this.props.Document.minvalue = number;
    }

    @action
    updateWidth() {
        this.barwidth = (this.barref.current ? this.barref.current.clientWidth : (952));
    }

    @action
    leftboundSet = (number: number) => {
        this.props.Document.transtate = false;
        runInAction(() => this.leftbound = number);
        this.markerrender();
    }
    @action
    rightboundSet = (number: number) => {
        this.props.Document.transtate = false;
        this.rightbound = number; 
        this.markerrender();
    }

    @action
    onPointerDown_Dragger = async (e: React.PointerEvent) => {
        e.persist();
        this._downX = this._lastX = e.pageX;
        this._downY = this._lastY = e.pageY;
        this.downbool = false;
        let leftval = (e.pageX - document.body.clientWidth + this.screenref.current!.clientWidth);
        let mintick: React.RefObject<HTMLDivElement>;

        let minticknum = Infinity;
        for (let ticks of this.tickrefs) {
            if (ticks.current !== null) {
                if (Math.abs(leftval - parseFloat(ticks.current.style.left!)) < minticknum) {
                    minticknum = Math.abs(leftval - parseFloat(ticks!.current.style.left!));
                    mintick = ticks;
                }
            }
        }
        if (e.button===0){
            leftval = parseFloat(mintick!.current!.style.left!);
            let d = new Doc;
            document.addEventListener("pointermove", this.onPointerMove_Selector, true);
            document.addEventListener("pointerup", this.onPointerUp_Selector, true);
        this.preventbug = true;
        e.preventDefault;
        d.initialLeft = leftval;
        d.firstLeft = leftval;
        d.initialScale = (this.barwidth / (this.barwidth - this.rightbound - this.leftbound));
        d.initialX = this.leftbound;
        d.initialWidth = 10;
        d.initialMapLeft = (((leftval / this.barref.current!.clientWidth)) * (this.barwidth - this.rightbound - this.leftbound)) + this.leftbound;
        d.initialMapWidth = 10;
            d.annotation = "hi";
            d.color = this.selectedColor;
            d.sortstate = this.sortstate;
            this.markerDocs.push(d);
        }
        if (e.button===2){
            document.addEventListener("pointermove", this.onPointerMove_Marquee, true);
            document.addEventListener("pointerup", this.onPointerUp_Marquee, true);
        }
    }

    @action
    onPointerMove_Marquee = async (e: PointerEvent) => {
        console.log("FGSF")
        this._lastY = e.pageY;
        this._lastX = e.pageX;
        
        
            this.marqueeSelect();
            if (Math.abs(this._lastX - this._downX) > Utils.DRAG_THRESHOLD ||
                Math.abs(this._lastY - this._downY) > Utils.DRAG_THRESHOLD) {
                this._visible = true;
                console.log("YUHHH");
                e.stopPropagation();
                e.preventDefault();
            }
        
    }
    
    @action
    onPointerUp_Selector = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onPointerMove_Marquee, true);
        if (this._visible) {
            if (!e.shiftKey) {
                SelectionManager.DeselectAll(undefined);
            }
        }
        runInAction(()=>this._visible = false);
        this.preventbug = false;
        for (let select of this.newselect) {
            if (!this.selections.includes(select)) {
                this.selections.push(select);
            }
        }
    }

     marqueeSelect() {
        let newselect = [];
        if (this.marqueeref.current !== null) {
            let posInfo = this.marqueeref.current.getBoundingClientRect();
            for (let thumbnails of this.thumbnails) {
                if (thumbnails.thumbnailref !== undefined) {
                    let thumbnail = thumbnails.thumbnailref;
                    let thumbnailinfo = thumbnail!.getBoundingClientRect();
                    let header = thumbnails.headerref;
                    if ((thumbnailinfo.left > posInfo.left && thumbnailinfo.left < posInfo.right) || (thumbnailinfo.right > posInfo.left && thumbnailinfo.right < posInfo.right)) {
                        this.focus(thumbnail, header);
                        newselect.push(thumbnail);
                    }
                    else {
                        this.unfocus(thumbnail, header);
                    }
                    for (let select of this.selections) {
                        if (select === thumbnail) {
                            this.focus(thumbnail, header);
                        }
                    }
                }
            }
        }
        this.newselect = newselect;
    }
    private newselect: (HTMLDivElement | undefined)[] = [];


    @computed
    get marqueeDiv() {
        let v = this.props.ScreenToLocalTransform().translate(0, 0).transformDirection(this._lastX - this._downX, this._lastY - this._downY);
        return <div ref={this.marqueeref} className="marquee" style={{ width: `${Math.abs(v[0])}`, height: `${Math.abs(v[1])}`, zIndex: 2000 }} >
        </div>;

    }



    @action
    onPointerUp_Dragger = (e: PointerEvent): void => {
        this.downbool = true;
        document.removeEventListener("pointermove", this.onPointerMove_AdjustScale);
        this.screenref.current && (this.screenref.current.style.cursor = "grab");
    }


    @undoBatch
    makeBtnClicked = (): void => {
        let doc = Doc.GetProto(this.props.Document);
        doc.isButton = !BoolCast(doc.isButton);
        if (doc.isButton) {
            if (!doc.nativeWidth) {
                doc.nativeWidth = this.props.Document[WidthSym]();
                doc.nativeHeight = this.props.Document[HeightSym]();
            }
        } else {
            doc.nativeWidth = doc.nativeHeight = undefined;
        }
    }

    makeportal() {
        console.timeLog("portal made");
        let portal = Docs.Create.FreeformDocument([], { width: 100, height: 100, title: this.props.Document.title + ".portal" });
        //DocUtils.MakeLink(this.props.Document, portal, undefined, this.props.Document.title + ".portal");
        //this.makeBtnClicked();
        this.props.addDocTab && this.props.addDocTab(portal, portal, "onBottom");
    }

    @observable private transition: boolean | undefined;

    @action
    opacset = (boolean: boolean) => {
        console.log('hit');
        this.opac = boolean;
    }

    @observable
    downbool: boolean | undefined;

    @action
    createdownbool() {
        if (this.downbool === undefined) {
            this.downbool = true;
        }
    }

    @action
    onPointerDown_OnBar = (e: React.PointerEvent): void => {
        this.downbool = false;
        document.body.style.cursor = "grabbing";
        document.addEventListener("pointermove", this.onPointerMove_OnBar);
        e.stopPropagation();
        e.preventDefault();
    }

    @action
    onPointerMove_OnBar = (e: PointerEvent): void => {
        e.stopPropagation();
        let newx2 = this.rightbound - e.movementX;
        let newx = this.leftbound + e.movementX;
        if (newx2 < 0) {
            this.rightbound = 0;
        }
        else if (newx < 0) {
            this.leftbound = 0;
            this.rightbound = (newx2 + e.movementX);
        }
        else {
            this.leftbound = (this.leftbound + e.movementX);
            this.rightbound = (this.rightbound - e.movementX);
        }
        document.addEventListener("pointerup", this.onPointerUp);
        this.markerrender();
    }

    onPointerUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onPointerMove_LeftBound);
        document.removeEventListener("pointermove", this.onPointerMove_RightBound);
        document.removeEventListener("pointermove", this.onPointerMove_OnBar);
        document.removeEventListener("pointermove", this.onPointerMove_LeftResize);
        document.removeEventListener("pointermove", this.onPointerMove_RightResize);

        document.body.style.cursor = "default";
        this.downbool = true;
    }

    @action
    onPointerMove_LeftBound = (e: PointerEvent): void => {
        e.stopPropagation();
        if (this.leftbound + e.movementX < 0) {
            this.leftbound = 0;
        }
        else if (this.leftbound + e.movementX + 20 > this.barwidth - this.rightbound) {
            this.leftbound = (this.barwidth - this.rightbound - 20);
        }
        else {
            this.leftbound = (this.leftbound + e.movementX);
        }
        document.addEventListener("pointerup", this.onPointerUp);
        this.markerrender();
    }

    @action
    onPointerMove_RightBound = (e: PointerEvent): void => {
        e.stopPropagation();
        if (this.rightbound - e.movementX < 0) {
            this.rightbound = 0;
        }
        else if (this.rightbound + this.leftbound - e.movementX + 20 > this.barwidth) {
            this.rightbound = (this.barwidth - this.leftbound - 20);
        }
        else { this.rightbound = (this.rightbound - e.movementX); }

        document.addEventListener("pointerup", this.onPointerUp);
        this.markerrender();

    }

    @action
    onPointerDown_LeftBound = (e: React.PointerEvent): void => {

        document.addEventListener("pointermove", this.onPointerMove_LeftBound);
        e.stopPropagation();
        this.downbool = false;
    }

    @action
    onPointerDown2_RightBound = (e: React.PointerEvent): void => {
        document.addEventListener("pointermove", this.onPointerMove_RightBound);
        e.stopPropagation();
        this.downbool = (false);
    }

    @action
    onPointerDown_OffBar = (e: React.PointerEvent): void => {
        this.downbool = false;
        let temp = this.barwidth - this.rightbound - this.leftbound;
        let newx = e.pageX - document.body.clientWidth + this.screenref.current!.clientWidth / 0.98;
        this.leftbound = (newx);
        if (this.leftbound < 0) {
            this.leftbound = (0);
            newx = 0;
        }

        let newx2 = this.barwidth - temp - newx;
        this.rightbound = (newx2);
        if (newx2 < 0) {
            this.leftbound = (newx + newx2);
            this.rightbound = (0);
        }
        e.stopPropagation();
    }


    render() {
        this.props.Document._range = this._range;
        this.props.Document.minvalue = this.props.Document.minvalue = this._values[0] - this._range * 0.05;
        this.updateWidth();
        this.createRows();
        this.createticks();
        this.filtermenu();
        this.thumbnailloop();
        this.createdownbool();
        let p: [number, number] = this._visible ? this.props.ScreenToLocalTransform().translate(0, 0).transformPoint(this._downX < this._lastX ? this._downX : this._lastX, this._downY < this._lastY ? this._downY : this._lastY) : [0, 0];
        return (
            <div className="collectionTimelineView" ref={this.screenref} style={{ overflow: "scroll", cursor: "grab", width: "100%", height: "100%" }} onWheel={(e: React.WheelEvent) => e.stopPropagation()}>
                <div className="marqueeView" style={{ height: "100%", borderRadius: "inherit", position: "absolute", width: "100%", }} onPointerDown={this.onPointerDown_Dragger}>
                    {<div style={{ transform: `translate(${p[0]}px, ${p[1] - 0.58 * (document.body.clientHeight)}px)` }} >
                        {this._visible ? this.marqueeDiv : null}
                    </div>}
                </div>
                <Flyout
                    anchorPoint={anchorPoints.RIGHT_TOP}
                    content={<div>
                        <h5><b>Filter</b></h5>
                        {this.filterbuttons}
                    </div>
                    }>
                    <button id="schemaOptionsMenuBtn" style={{ position: "fixed" }}><FontAwesomeIcon style={{ color: "white" }} icon="cog" size="sm" /></button>
                </Flyout>
                <div ref={this.barref} className="backdropscroll" onPointerDown={this.onPointerDown_OffBar} style={{ zIndex: 99, height: "50px", top: this.rowval[this.rowval.length - 1], width: "100%", bottom: "90%", position: "fixed", }}>
                    {this.thumbnails.map(item => <div
                        style={{
                            position: "absolute",
                            background: "black",
                            zIndex: 90,
                            top: "25%", left: item.mapleft + "px", width: "5px", border: "3px solid"
                        }}>
                    </div>)}
                    {/*this.markermap*/}
                    <div className="v1" onPointerDown={this.onPointerDown_LeftBound} style={{ cursor: "ew-resize", position: "absolute", zIndex: 100, left: this.leftbound, height: "100%" }}></div>
                    <div className="v2" onPointerDown={this.onPointerDown2_RightBound} style={{ cursor: "ew-resize", position: "absolute", right: this.rightbound, height: "100%", zIndex: 100 }}></div>
                    <div className="bar" onPointerDown={this.onPointerDown_OnBar} style={{ zIndex: 2, left: this.leftbound, width: this.barwidth - this.rightbound - this.leftbound, height: "100%", position: "absolute" }}>
                    </div>
                </div>
                <Measure onResize={() => this.updateWidth()}>
                    {({ measureRef }) => <div ref={measureRef}> </div>}
                </Measure>
                <div onPointerDown={this.onPointerDown_Dragger} style={{ top: "0px", position: "absolute", height: "100%", width: "100%", }}>
                    {this.rows}
                    {this.thumbnails.map(doc =>
                        <Thumbnail
                            scale={this.rowscale}
                            scrollTop={document.body.scrollTop}
                            CollectionView={this.props.CollectionView}
                            active={this.props.active}
                            whenActiveChanged={this.props.whenActiveChanged}
                            addDocTab={this.props.addDocTab}
                            pinToPres={this.props.pinToPres}
                            createportal={() => this.makeportal()} leftval={doc.leftval} doc={doc.doc} sortstate={this.sortstate} top={this.rowval[doc.row]} timelinetop={this.timelineref.current ? parseFloat(this.timelineref.current!.style.top!) : document.body.clientHeight * 0.75}
                            transition={BoolCast(this.transtate)}
                            toggleopac={BoolCast(this.opac)}
                            tog={this.opacset}
                            pointerDown={this.downbool ? this.downbool : false}
                            timelineTop={this.rowval[Math.round(this.rowval.length / 2)]}
                        >
                        </Thumbnail>
                    )}
                    {console.log(this.markerDocs.length)}
                    {this.markerDocs.map(d => this.createmarker(d))}
                    <div style={{
                        position: "absolute", top: this.rowval[Math.round(this.rowval.length / 2)], height: this.rowscale, width: "100%", borderTop: "1px solid black"
                    }}>
                        {this.ticks}
                    </div>

                </div>
            </div >
        );
    }
}