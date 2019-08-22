import React = require("react");
import { observer } from "mobx-react";
import { action, computed, observable, untracked, runInAction } from "mobx";
import { Doc, DocListCast, Field, FieldResult, DocListCastAsync } from "../../../new_fields/Doc";
import { NumCast, Cast, StrCast, } from "../../../new_fields/Types";
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
import { Docs } from "../../documents/Documents";
import { ProxyField } from "../../../new_fields/Proxy";
import Measure from "react-measure";
import { EditableView } from "../EditableView";
import { listSpec } from "../../../new_fields/Schema";
import { BottomUI } from "./CollectionTimeLineViewBottomUI";
import { anchorPoints, Flyout } from "../DocumentDecorations";


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
    thumbnail: JSX.Element,
    thumbnailref: HTMLDivElement | undefined,
    thumbnailref2: HTMLDivElement | undefined,
    header: JSX.Element,
    headerref: HTMLDivElement | undefined,
    headerref2: HTMLDivElement | undefined,
    map: JSX.Element,
    mapref: HTMLDivElement | undefined,
    data: any;
    doc: Doc;
    leftval: number;

};

@observer
export class CollectionTimelineView extends CollectionSubView(doc => doc) {
    @observable private sortstate: string = "x";
    private _range = 0;
    private screenref = React.createRef<HTMLDivElement>();
    private barref = React.createRef<HTMLDivElement>();
    private marqueeref = React.createRef<HTMLDivElement>();
    @observable private types: boolean[] = [];

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


    @action
    initializeMarkers = async () => {
        let markers = this.markerDocs;
        for (let marker of markers) {
            let doc = await marker;
            let markerUnit = { document: doc, ref: undefined, mapref: undefined } as MarkerUnit;
            markerUnit.element = (< div ref={(el) => el ? markerUnit.ref = el : null} onPointerDown={(e) => this.onPointerDown_DeleteMarker(e, String(markerUnit.document.annotation), markerUnit)}
                style={{
                    top: String(document.body.clientHeight * 0.65 + 72), border: "2px solid" + (markerUnit.document.color),
                    width: "10px", height: "30px", backgroundColor: String(markerUnit.document.color), opacity: 0.5, position: "absolute", left: 0,
                }}></div>);
            markerUnit.map = <div className="ugh" ref={(el) => el ? markerUnit.mapref = el : null}
                style={{
                    position: "absolute",
                    background: String(markerUnit.document.color),
                    zIndex: 1,
                    top: this.previewHeight(String(markerUnit.document.color)),
                    left: NumCast(doc.initialMapLeft),
                    width: NumCast(doc.initialMapWidth),
                    border: "3px solid" + String(markerUnit.document.color)
                }}></div>;
        }
    }

    createmarker = (doc: Doc): JSX.Element | undefined => {
        let markerUnit = { document: doc, ref: undefined, mapref: undefined } as MarkerUnit;
        markerUnit.element = (< div ref={(el) => el ? markerUnit.ref = el : null} onDoubleClick={(e) => this.doubleclick(e, markerUnit)} onPointerDown={(e) => this.onPointerDown_DeleteMarker(e, String(markerUnit.document.annotation), markerUnit)}
            style={{
                top: String(document.body.clientHeight * 0.65 + 72), border: "2px solid" + String(markerUnit.document.color),
                width: NumCast(doc.initialWidth), height: "30px", backgroundColor: String(markerUnit.document.color), zIndex: 5, opacity: 0.5, padding: "2px",
                position: "absolute", left: NumCast(doc.initialLeft),
            }}>
            <EditableView
                contents={doc.annotation}
                SetValue={this.annotationUpdate}
                GetValue={() => ""}
                display={"inline"}
                height={30}
                oneLine={true}
            />
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
                top: this.previewHeight(String(doc.color)),
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
            this.unfocus(thumbnail.thumbnailref, thumbnail.headerref);
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
        if (e.ctrlKey) {
            this.markerDocs.splice(this.markerDocs.indexOf(markerUnit.document), 1);
            this.selectedMarker = undefined;
        }
        else {
            this.selectedMarker ? this.selectedMarker.ref!.style.opacity = "0.5" : null;
            this.selectedMarker ? this.selectedMarker.ref!.style.border = "0px solid black" : null;
            this.selectedMarker = markerUnit;
            this.selectedMarker.ref!.style.opacity = "0.9";
            this.selectedMarker.ref!.style.border = "1px solid black";
            this.selectedMarker.ref!.style.borderStyle = "dashed";
            this.selectedMarker.ref!.style.backgroundColor ? this.selectedColor = this.selectedMarker.ref!.style.backgroundColor : null;
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

    @action
    previewHeight(color: string) {
        return "80%";
    }

    onPointerMove_Selector = async (e: PointerEvent) => {
        let doc = await this.markerDocs[this.markerDocs.length - 1];
        if (e.altKey && this.preventbug) {
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
                    if (Math.abs(leftval - parseFloat(ticks.current.style.left)) < minticknum) {
                        minticknum = Math.abs(leftval - parseFloat(ticks!.current.style.left!));
                        mintick = ticks;
                    }
                }
            }
            mintick.current!.classList.add("hover");


            for (let markers of this.markerDocs) {
                let marker = await markers;
                if (leftval > NumCast(marker.initialLeft!) && leftval < NumCast(marker.initialLeft!) + NumCast(marker.initialWidth!) && this.sortstate === marker.sortstate) {
                    return;
                }
            }
            doc.initialWidth = newwidth;
            doc.initialMapWidth = newmapwidth;
        }
    }

    @action
    onPointerUp_Selector = async (e: PointerEvent) => {
        document.removeEventListener("pointermove", this.onPointerMove_Selector, true);
        let mintick: React.RefObject<HTMLDivElement>;
        let minticknum = Infinity;
        let doc = await this.markerDocs[this.markerDocs.length - 1];
        let leftval = NumCast(doc.initialLeft) + NumCast(doc.initialWidth);
        for (let ticks of this.tickrefs) {
            if (ticks.current !== null) {
                ticks.current!.classList.remove("hover");

                if (Math.abs(leftval - parseFloat(ticks.current.style.left)) < minticknum) {
                    minticknum = Math.abs(leftval - parseFloat(ticks!.current.style.left!));
                    mintick = ticks;
                }
            }
        }

        doc.initialWidth = parseFloat(mintick.current.style.left) - NumCast(doc.initialLeft);
        if (doc.initialWidth === 0) {
            runInAction(() => this.markerDocs.pop());
        }
    }

    private newselect: (HTMLDivElement | undefined)[] = [];

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

    @computed
    get marqueeDiv() {
        let v = this.props.ScreenToLocalTransform().translate(0, 0).transformDirection(this._lastX - this._downX, this._lastY - this._downY);
        return <div ref={this.marqueeref} className="marquee" style={{ width: `${Math.abs(v[0])}`, height: `${Math.abs(v[1])}`, zIndex: 2000 }} >
        </div>;

    }

    focus(thumbnail: HTMLDivElement | undefined, header: HTMLDivElement | undefined) {
        thumbnail!.classList.toggle("selected", true);
        thumbnail!.classList.toggle("unselected", false);
        header!.classList.toggle("selection", true);
        header!.classList.toggle("unselection", false);
    }

    unfocus(thumbnail: HTMLDivElement | undefined, header: HTMLDivElement | undefined) {
        thumbnail!.classList.toggle("selected", false);
        thumbnail!.classList.toggle("unselected", true);
        header!.classList.toggle("selection", false);
        header!.classList.toggle("unselection", true);
    }

    @action
    select(e: React.MouseEvent<HTMLDivElement>, d: Doc, b: HTMLDivElement | undefined) {
        var thumbnail = undefined;
        var header = undefined;
        for (let thumbnails of this.thumbnails) {
            if (thumbnails.thumbnailref === b) {
                thumbnail = (thumbnails.thumbnailref);
                header = thumbnails.headerref;
            }
        }
        if (e.ctrlKey) {
            if (thumbnail!.classList.contains("selected")) {
                this.unfocus(thumbnail, header);
                for (let i = 0; i < this.selections.length; i++) {
                    if (this.selections[i] === thumbnail) {
                        this.selections.splice(i, 1);
                    }
                }
            }
            else {
                this.focus(thumbnail, header);
                this.selections.push(thumbnail);
            }
        }
        else {
            this.selections = [];
            for (let thumbnails of this.thumbnails) {
                this.unfocus(thumbnails.thumbnailref, thumbnails.headerref);
            }
            if (!thumbnail!.classList.contains("selected")) {
                this.focus(thumbnail, header);
                this.selections.push(thumbnail);
            }
        }
    }


    private _values: number[] = [];
    private ticks: JSX.Element[] = [];
    private thumbnails: Node[] = [];

    private filterDocs = (thumbnail: Node[]): Node[] => {
        let thumbnails = [];
        for (let oldthumbnail of thumbnail) {
            if (this.filtered.includes("Image")) { if (oldthumbnail.data instanceof ImageField) { thumbnails.push(oldthumbnail); } }
            if (this.filtered.includes("Audio")) { if (oldthumbnail.data instanceof AudioField) { thumbnails.push(oldthumbnail); } }
            if (this.filtered.includes("Pdf")) { if (oldthumbnail.data instanceof PdfField) { thumbnails.push(oldthumbnail); } }
            if (this.filtered.includes("Text")) { if (oldthumbnail.data instanceof RichTextField) { thumbnails.push(oldthumbnail); } }
            if (this.filtered.includes("Video")) { if (oldthumbnail.data instanceof VideoField) { thumbnails.push(oldthumbnail); } }
            if (this.filtered.includes("Web")) { if (oldthumbnail.data instanceof WebField) { thumbnails.push(oldthumbnail); } }
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
        this._range = 1;
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
        for (let i = 0; i < backup.length; i++) {
            leftval = (((values[i] - values[0]) * this.barwidth / this._range) * (this.barwidth / (this.barwidth - this.rightbound - this.leftbound)) - (this.leftbound * (this.barwidth) / (this.barwidth - this.rightbound - this.leftbound))) + "px";
            //Creating the node
            let newNode: Node = {
                thumbnail: (<div ref={(el) => el ? newNode.thumbnailref2 = el : null} onClick={(e) => this.select(e, keyvalue[i].doc, newNode.thumbnailref)} style={{ top: "0px", position: "absolute", left: leftval, width: "100px", height: "100px" }}>
                    <div ref={(el) => el ? newNode.thumbnailref = el : null} className="unselected" style={{ position: "absolute", width: "100px", height: "100px", pointerEvents: "all" }}>
                        <FontAwesomeIcon icon={this.checkData(docs[i])} size="sm" style={{ position: "absolute" }} />
                        <div className="window" style={{ pointerEvents: "none", zIndex: 10, width: "94px", height: "94px", position: "absolute" }}>
                            <div className="window" style={{ background: "white", pointerEvents: "none", zIndex: -1, position: "absolute", width: "94px", height: "94px" }}>
                                {this.documentDisplay(docs[i], 94, 94)}
                            </div>
                        </div>
                    </div>
                </div>),
                thumbnailref: undefined,
                thumbnailref2: undefined,
                header: (
                    <div ref={(el) => el ? newNode.headerref = el : null} className="unselection" style={{
                        zIndex: 99, position: "absolute", left: leftval, top: "100px",
                    }}>
                        <div style={{
                            border: "3px solid #9c9396",
                            backgroundColor: "9c9396",
                            borderRadius: "10px 10px 0px 0px",
                            whiteSpace: "nowrap",
                            textOverflow: "ellipsis", position: "absolute", overflow: "hidden", paddingLeft: "3px", paddingRight: "3px", paddingTop: "3px", top: "-130px", zIndex: 99, width: "100px", height: "30px"
                        }}> {docs[i].title}</div>
                        <div style={{ width: "100", border: "3px solid #9c9396", borderRadius: "0px 0px 10px 0px", }}>
                            <EditableView
                                contents={this.getCaption(docs[i])}
                                SetValue={(strng) => this.captionupdate(docs[i], strng)}
                                GetValue={() => ""}
                                display={"inline"}
                                height={30}
                            />
                        </div>


                        <div ref={(el) => el ? newNode.headerref2 = el : null} style={{ alignItems: "center", justifyItems: "center", display: "flex", position: "absolute", height: (document.body.clientHeight * 0.75 - document.body.clientHeight / 4) - 100, width: "2px", backgroundColor: "#9c9396" }}>
                            <div style={{ paddingLeft: "3px" }}>
                                {this.sortstate}:{Math.round(NumCast(docs[i][this.sortstate]))}</div>

                        </div>
                    </div >
                ),
                doc: docs[i],
                headerref: undefined,
                headerref2: undefined,
                map: (
                    <div ref={(el) => el ? newNode.mapref = el : null}
                        style={{
                            position: "absolute",
                            background: "black",
                            zIndex: 90,
                            top: "25%", left: ((values[i] - values[0]) * this.barwidth / this._range) + "px", width: "5px", border: "3px solid"
                        }}>
                    </div>),
                mapref: undefined,
                data: docs[i].data,
                leftval: parseFloat(leftval),
            };
            this.thumbnails.push(newNode);
        }
        this.thumbnails = this.filterDocs(this.thumbnails);
    }

    captionupdate(doc: Doc, string: string) {
        doc = Doc.GetProto(doc);
        let caption = Cast(doc.caption, RichTextField);
        doc.caption = new RichTextField(caption ? caption[FromPlainText](string) : RichTextField.Initialize(string));
        return true;
    }

    getCaption = (doc: Doc) => {
        doc = Doc.GetProto(doc);
        let caption = Cast(doc.caption, RichTextField);
        console.log(caption ? caption[ToPlainText]() : "No caption");
        return caption ? caption[ToPlainText]() : "No caption";
    }

    adjustY() {
        for (let thumbnail1 of this.thumbnails) {
            thumbnail1!.headerref!.style.top! = "100";
            thumbnail1!.thumbnailref2!.style.top! = "0";
            thumbnail1!.headerref2!.style.height! = String((document.body.clientHeight * 0.75 - document.body.clientHeight / 4) - 100);
            thumbnail1.headerref2!.style.top! = "0";
        }
        let overlap = false;
        while (overlap === false) {
            overlap = true;
            for (let thumbnail1 of this.thumbnails) {
                for (let thumbnail2 of this.thumbnails) {
                    let thumbnail1y = parseFloat(thumbnail1.thumbnailref2!.style.top!);
                    let thumbnail2y = parseFloat(thumbnail2.thumbnailref2!.style.top!);
                    if (((thumbnail1.leftval >= thumbnail2.leftval && thumbnail1.leftval - 100 < thumbnail2.leftval)
                        || (thumbnail1.leftval <= thumbnail2.leftval && thumbnail1.leftval + 100 > thumbnail2.leftval))
                        && ((thumbnail1y! >= thumbnail2y! && thumbnail1y! - 100 <= thumbnail2y!)
                            || (thumbnail1y! <= thumbnail2y! && thumbnail1y! + 100 >= thumbnail2y!))
                        && thumbnail1 !== thumbnail2) {
                        let curtop = parseFloat(thumbnail1!.headerref!.style.top!);
                        let curthumb = parseFloat(thumbnail1!.thumbnailref2!.style.top!);
                        let curpreview = parseFloat(thumbnail1!.headerref2!.style.height!);
                        curtop += 105;
                        curthumb += 105;
                        curpreview -= 105;
                        thumbnail1!.headerref!.style.top! = String(curtop);
                        thumbnail1!.thumbnailref2!.style.top! = String(curthumb);
                        thumbnail1!.headerref2!.style.height! = String(curpreview);
                        overlap = false;
                    }
                }
            }
        }
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
                let val = Math.round(counter * this._range / 1000 + this._values[0]);
                this.ticks.push(<div className="max" ref={tickref} style={{
                    position: "absolute", top: "0%", left: leftval, zIndex: -100, writingMode: "vertical-rl",
                    textOrientation: "mixed",
                }
                }> <div style={{ paddingTop: "10px" }}>{val}</div></div >);
            }
            else if (counter % 50 === 0) { this.ticks.push(<div className="max2" ref={tickref} style={{ position: "absolute", top: "0%", left: leftval, zIndex: -100 }} />); }
            else if (counter % 10 === 0) { this.ticks.push(<div className="active" ref={tickref} style={{ position: "absolute", top: "0%", left: leftval, zIndex: -100 }} />); }
            //else { this.ticks.push(<div className="inactive" style={{ position: "absolute", top: "0%", left: leftval, zIndex: -100 }} />); }
            counter++;
        }
    }

    @action
    checkData = (document: Doc): IconProp => {
        let field = document.data;
        if (field instanceof AudioField) { return faMusic; }
        else if (field instanceof PdfField) { return faFilePdf; }
        else if (field instanceof RichTextField) { return faFont; }
        else if (field instanceof ImageField) { return faImage; }
        else if (field instanceof VideoField) { return faFilm; }
        else if (field instanceof WebField) { return faGlobeAsia; }
        else if (field instanceof ProxyField) { return faObjectGroup; }
        return faBell;
    }

    documentDisplay(d: Doc, width: number, height: number) {
        let nativeWidth = NumCast(d.nativeWidth, width);
        let nativeHeight = NumCast(d.nativeHeight, height);
        let wscale = width / (nativeWidth ? nativeWidth : width);
        if (wscale * nativeHeight > height) {
            wscale = height / (nativeHeight ? nativeHeight : height);
        }
        let contentScaling = () => wscale;
        let transform = () => new Transform(0, 0, 1);
        let PanelWidth = () => nativeWidth * contentScaling();
        let PanelHeight = () => nativeHeight * contentScaling();
        let getTransform = () => transform().translate(-centeringOffset, 0).scale(1 / contentScaling());
        let centeringOffset = () => (width - nativeWidth * contentScaling()) / 2;
        return (
            <div className="collectionSchemaView-previewDoc" style={{ transform: `translate(${centeringOffset}px, 0px)`, width: width, height: "94px", overflow: "hidden" }}>
                <DocumentView
                    Document={d}
                    selectOnLoad={false}
                    ScreenToLocalTransform={getTransform}
                    addDocument={this.props.addDocument} moveDocument={this.props.moveDocument}
                    ContentScaling={contentScaling}
                    PanelWidth={() => 94} PanelHeight={() => 94}
                    ContainingCollectionView={this.props.CollectionView}
                    focus={emptyFunction}
                    parentActive={this.props.active}
                    whenActiveChanged={this.props.whenActiveChanged}
                    bringToFront={emptyFunction}
                    addDocTab={this.props.addDocTab}
                    renderDepth={0}
                    zoomToScale={emptyFunction}
                    getScale={returnOne}
                    backgroundColor={returnEmptyString}
                />
            </div>);
    }

    @observable private selectedMarker: MarkerUnit | undefined;
    @observable private selectedColor: string = "ffff80";

    @action annotationUpdate = (newValue: string) => {
        this.selectedMarker!.document.annotation = newValue;
        return true;
    }

    @observable private barwidth = (this.barref.current ? this.barref.current.clientWidth : (952));
    @observable private leftbound = 0;
    @observable private rightbound = 0;

    @action
    updateWidth() {
        this.barwidth = (this.barref.current ? this.barref.current.clientWidth : (952));
    }

    @action
    leftboundSet = (number: number) => {
        runInAction(() => this.leftbound = number);
        this.markerrender();
    }
    @action
    rightboundSet = (number: number) => { this.rightbound = number; this.markerrender(); }
    selectedColorSet = (color: string) => { this.selectedColor = color; };
    barwidthSet = (color: number) => { this.barwidth = color; this.markerrender(); };

    @action
    setsortsate = (string: string) => {
        this.sortstate = string; this.adjustY(); this.adjustY();
    }

    @observable private truesort: string = "sortinput";
    onPointerDown_Dragger = async (e: React.PointerEvent) => {
        let leftval = (e.pageX - document.body.clientWidth + this.screenref.current!.clientWidth);
        let mintick: React.RefObject<HTMLDivElement>;

        let minticknum = 9999999999;
        for (let ticks of this.tickrefs) {
            if (ticks.current !== null) {
                if (Math.abs(leftval - parseFloat(ticks.current.style.left)) < minticknum) {
                    minticknum = Math.abs(leftval - parseFloat(ticks!.current.style.left!));
                    mintick = ticks;
                }
            }
        }
        //mintick.current.style.borderStyle = "dashed";
        //mintick.current.style.height = "50px";


        if (e.altKey) {
            leftval = parseFloat(mintick.current.style.left);
            for (let markers of this.markerDocs) {
                let marker = await markers;
                if (leftval >= NumCast(marker.initialLeft!) && leftval < NumCast(marker.initialLeft!) + NumCast(marker.initialWidth!) && this.sortstate === marker.sortstate) {
                    return;
                }
            }

            document.addEventListener("pointermove", this.onPointerMove_Selector, true);
            document.addEventListener("pointerup", this.onPointerUp_Selector, true);
            this.preventbug = true;
            e.preventDefault;
            let d = new Doc;
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

        else {
            document.addEventListener("pointermove", this.onPointerMove_Dragger, true);
            document.addEventListener("pointerup", this.onPointerUp_Dragger, true);
            this.screenref.current!.style.cursor = "grabbing";
        }
    }
    @action
    onPointerMove_Dragger = (e: PointerEvent): void => {
        document.addEventListener("pointerup", this.onPointerUp_Dragger, true);
        if (this.rightbound + e.movementX < 0) {
            this.rightbound = 0;

        }
        else if (this.leftbound - e.movementX < 0) {
            this.leftbound = 0;
        }
        else {
            this.rightbound += e.movementX;
            this.leftbound -= e.movementX;
        }
        this.markerrender();
    }
    onPointerUp_Dragger = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onPointerMove_Dragger, true);
        document.removeEventListener("pointerup", this.onPointerUp_Dragger, true);
        this.screenref.current!.style.cursor = "grab";
    }
    @action
    updatetrue() {
        (this.thumbnails.length > 0 ? this.truesort = "sortinputRIGHT" : this.truesort = "sortinputWRONG");

    }

    render() {
        this.updateWidth();
        this.createticks();
        this.filtermenu();
        this.thumbnailloop();
        this.updatetrue();
        let p: [number, number] = this._visible ? this.props.ScreenToLocalTransform().translate(0, 0).transformPoint(this._downX < this._lastX ? this._downX : this._lastX, this._downY < this._lastY ? this._downY : this._lastY) : [0, 0];
        return (
            <div className="collectionTimelineView" ref={this.screenref} style={{ overflow: "scroll", cursor: "grab", width: "100%", height: "100%" }} onPointerDown={this.onPointerDown_Dragger} onWheel={(e: React.WheelEvent) => e.stopPropagation()}>
                <Flyout
                    anchorPoint={anchorPoints.RIGHT_TOP}
                    content={<div>
                        <h5><b>Filter</b></h5>
                        {this.filterbuttons}
                    </div>
                    }>
                    <button id="schemaOptionsMenuBtn" style={{ position: "fixed" }}><FontAwesomeIcon style={{ color: "white" }} icon="cog" size="sm" /></button>
                </Flyout>
                <div className="timeline" style={{ position: "fixed", height: "25px", width: "100%", top: String(document.body.clientHeight * 0.75) + "px", zIndex: 9999 }}>
                    {this.ticks}
                </div>
                {DocListCast(this.props.Document.markers).map(d => this.createmarker(d))}
                <BottomUI
                    thumbnailmap={this.thumbnails.map(item => item.map)}
                    markermap={DocListCast(this.props.Document.markers).map(d => this.createmap(d))}
                    leftbound={this.leftbound}
                    rightbound={this.rightbound}
                    leftboundSet={this.leftboundSet}
                    rightboundSet={this.rightboundSet}
                    _range={this._range}
                    barwidth={this.barwidth}
                    minvalue={this._values[0]}
                    sortstate={this.sortstate}
                    selectedColor={this.selectedColor}
                    selectedColorSet={this.selectedColorSet}
                    barref={this.barref}
                    barwidthSet={this.barwidthSet}
                    screenref={this.screenref}
                    markerrender={this.markerrender}
                    setsortstate={this.setsortsate}
                    truesort={this.truesort}>

                </BottomUI>
                <Measure onResize={() => this.updateWidth()}>
                    {({ measureRef }) => <div ref={measureRef}> </div>}
                </Measure>
                <div className="marqueeView" style={{ height: "40%", top: "60%", borderRadius: "inherit", position: "absolute", width: "100%", }}
                //onKeyDown={this.onKeyDown_Selector}>
                >
                    {<div style={{ transform: `translate(${p[0]}px, ${p[1] - 0.58 * (document.body.clientHeight)}px)` }} >
                        {this._visible ? this.marqueeDiv : null}
                    </div>}
                </div>
                <div style={{ top: document.body.clientHeight / 4, position: "absolute", bottom: "25%" }}>{this.thumbnails.map(item => item.thumbnail)}{this.thumbnails.map(item => item.header)}</div>
            </div >
        );
    }
}