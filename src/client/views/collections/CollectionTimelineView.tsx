import React = require("react");
import { action, computed, observable, untracked, ObservableMap, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast } from "../../../new_fields/Doc";
import { BoolCast, NumCast, StrCast, Cast, FieldValue, } from "../../../new_fields/Types";
import { emptyFunction, Utils } from "../../../Utils";
import { SelectionManager } from "../../util/SelectionManager";
import { DocumentView } from "../nodes/DocumentView";
import "./CollectionTimelineView.scss";
import { CollectionSubView, SubCollectionViewProps } from "./CollectionSubView";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { DateField } from "../../../new_fields/DateField";
import { List } from "../../../new_fields/List";
import { Transform } from "../../util/Transform";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { faFilePdf, faFilm, faFont, faGlobeAsia, faImage, faMusic, faObjectGroup, faBell } from '@fortawesome/free-solid-svg-icons';
import { RichTextField } from "../../../new_fields/RichTextField";
import { ImageField, VideoField, AudioField, URLField, PdfField, WebField } from "../../../new_fields/URLField";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { Docs } from "../../documents/Documents";
import { ProxyField } from "../../../new_fields/Proxy";
import Measure from "react-measure";
import { EditableView } from "../EditableView";
import { listSpec } from "../../../new_fields/Schema";
import { BottomUI } from "./CollectionTimeLineViewBottomUI";

type CompoundValue = String | number | Date;
type DocTuple = {
    doc: Doc,
    value: CompoundValue
};

type MarkerUnit = {
    document: Doc,
    element: JSX.Element,
    ref: HTMLDivElement | undefined,
    map: JSX.Element,
    mapref: HTMLDivElement | undefined;
};

type Node = {
    button: JSX.Element,
    buttonref: HTMLDivElement | undefined,
    header: JSX.Element,
    headerref: HTMLDivElement | undefined,
    map: JSX.Element,
    mapref: HTMLDivElement | undefined,
    data: any;
};

@observer
export class CollectionTimelineView extends CollectionSubView(doc => doc) {
    @observable private sortstate: string = "x";
    private _range = 0;
    private screenref = React.createRef<HTMLDivElement>();
    private barref = React.createRef<HTMLDivElement>();
    private marqueeref = React.createRef<HTMLDivElement>();
    @observable private types: boolean[] = [];
    private fellas: boolean[] = [];

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
        document.addEventListener("keydown", (e) => this.onKeyPress_Selector(e));
    }
    @action
    initializeMarkers = async () => {
        let markers = this.markerDocs;
        for (let i = 0; i < markers.length; i++) {
            let doc = await markers[i];
            let markerUnit = { document: doc, ref: undefined, mapref: undefined } as MarkerUnit;
            markerUnit.element = (< div ref={(el) => el ? markerUnit.ref = el : null} onPointerDown={(e) => this.onPointerDown_DeleteMarker(e, String(markerUnit.document.annotation), markerUnit)}
                style={{
                    top: String(document.body.clientHeight * 0.65 + 72), border: "2px solid" + (markerUnit.document.color),
                    width: "10px", height: "30px", backgroundColor: String(markerUnit.document.color), opacity: "0.25", position: "absolute", left: 0,
                }}></div>);
            markerUnit.map = <div className="ugh" ref={(el) => el ? markerUnit.mapref = el : null}
                style={{
                    position: "absolute",
                    background: String(markerUnit.document.color),
                    zIndex: "1",
                    top: this.previewHeight(String(markerUnit.document.color)),
                    left: doc.initialMapLeft,
                    width: doc.initialMapWidth,
                    border: "3px solid" + String(markerUnit.document.color)
                }}></div>;
        }
    }

    createmarker = (doc: Doc | Promise<Doc>): JSX.Element => {
        let markerUnit = { document: doc, ref: undefined, mapref: undefined } as MarkerUnit;
        markerUnit.element = (< div ref={(el) => el ? markerUnit.ref = el : null} onPointerDown={(e) => this.onPointerDown_DeleteMarker(e, String(markerUnit.document.annotation), markerUnit)}
            style={{
                top: String(document.body.clientHeight * 0.65 + 72), border: "2px solid" + (markerUnit.document.color),
                width: doc.initialWidth, height: "30px", backgroundColor: String(markerUnit.document.color), zIndex: 5, opacity: "0.25", position: "absolute", left: doc.initialLeft,
            }}></div>);
        return markerUnit.element;
    }

    createmap = (doc: Doc | Promise<Doc>): JSX.Element => {
        let map = <div
            style={{
                position: "absolute",
                background: String(doc.color),
                zIndex: 2,
                top: this.previewHeight(String(doc.color)),
                left: doc.initialMapLeft,
                width: doc.initialMapWidth,
                border: "3px solid" + String(doc.color)
            }}></div>;
        return map;
    }

    componentWillUnmount() {
        document.removeEventListener("keydown", (e) => this.onKeyPress_Selector(e));
    }

    sortdate(a: Doc, b: Doc) {
        var adate: DateField = a.creationDate;
        var bdate: DateField = b.creationDate;
        return new Date(adate.date) - new Date(bdate.date);
    }

    strcompare = (stringOne: string, stringTwo: string): number => {
        let cur = 0;
        while (cur < stringOne.length && cur < stringTwo.length) {
            if (stringOne[cur] !== stringTwo[cur]) {
                break;
            }
            cur++;
        }
        return stringOne.charCodeAt(cur) - stringTwo.charCodeAt(cur);
    }

    @action
    toggleKey = (key: string, num: number, guy: React.RefObject<HTMLInputElement>) => {
        this.sortstate = key;
        this.fellas[num] = guy.current!.checked;
    }

    private newdudes: JSX.Element[] = [];

    filtermenu() {
        let dudess = ["Audio", "Pdf", "Text", "Image", "Video", "Web", "Misc"];
        this.newdudes = [];

        for (let i = 0; i < dudess.length; i++) {
            let doc = dudess[i];
            let guy = React.createRef<HTMLInputElement>();
            this.newdudes.push(
                <div><input ref={guy} type="checkbox" checked={this.types[i]} onChange={() => this.toggleFilter(doc, i, guy)} />{doc}</div>);
        }
    }

    @action
    toggleFilter = (key: string, i: number, guy: React.RefObject<HTMLInputElement>) => {
        if (this.filtered.includes(key)) {
            this.filtered.splice(this.filtered.indexOf(key), 1);
        }
        else {
            this.filtered.push(key);
        }
        this.types[i] = guy.current!.checked;
    }

    @observable private filtered: String[] = ["Audio", "Pdf", "Text", "Image", "Video", "Web", "Misc"];
    @observable private preview: Doc | undefined;
    @observable private preview4: string;
    private selections: (HTMLDivElement | undefined)[] = [];
    @observable _lastX: number = 0;
    @observable _lastY: number = 0;
    @observable _downX: number = 0;
    @observable _downY: number = 0;
    @observable _visible: boolean = false;

    @action
    markerrender() {
        this.markerDocs.forEach(doc => {

            let newscale = (this.barwidth / (this.barwidth - this.rightbound - this.leftbound));
            doc.initialLeft = doc.initialLeft * newscale / doc.initialScale - ((this.leftbound - doc.initialX));
            doc.initialX = this.leftbound;
            doc.initialWidth = (doc.initialWidth * newscale / doc.initialScale);
            doc.initialScale = newscale;
        });
    }

    @action
    onPointerDown_DeleteMarker = (e: React.PointerEvent, annotation: string, markerUnit: MarkerUnit): void => {
        if (e.ctrlKey) {
            this.markerDocs.splice(this.markerDocs.indexOf(markerUnit.document), 1);
        }
        else {
            this.selectedMarker ? this.selectedMarker.ref.style.opacity = "0.25" : null;
            this.selectedMarker ? this.selectedMarker.ref.style.border = "0px solid black" : null;
            this.annotationText = annotation;
            this.selectedMarker = markerUnit;
            this.selectedMarker.ref.style.opacity = "0.9";
            this.selectedMarker.ref.style.border = "1px solid black";
            this.selectedMarker.ref.style.borderStyle = "dashed";
            this.selectedColor = this.selectedMarker.ref.style.backgroundColor;
        }
    }

    @action
    onPointerDown_Selector = (e: React.PointerEvent): void => {
        document.addEventListener("pointermove", this.onPointerMove_Selector, true);
        document.addEventListener("pointerup", this.onPointerUp_Selector, true);
        if (e.altKey) {
            e.preventDefault;
            let leftval = (e.pageX - document.body.clientWidth + this.screenref.current!.clientWidth / 0.98);
            let d = new Doc;
            d.initialLeft = leftval;
            d.initialScale = (this.barwidth / (this.barwidth - this.rightbound - this.leftbound));
            d.initialX = this.leftbound;
            d.initialWidth = 10;
            d.initialMapLeft = (((leftval / this.barref.current.clientWidth)) * (this.barwidth - this.rightbound - this.leftbound)) + this.leftbound;
            d.initialMapWidth = 10;
            d.annotation = "Edit me!";
            d.color = this.selectedColor;
            this.markerDocs.push(d);
        }
        else {
            if (e.pageY > document.body.clientHeight * 0.6 && e.pageY < document.body.clientHeight * 0.79) {
                this._downX = this._lastX = e.pageX;
                this._downY = this._lastY = e.pageY;
                if (!e.ctrlKey) {
                    for (let i = 0; i < this.buttons.length; i++) {
                        if (this.buttons[i].buttonref !== undefined) {
                            let button = this.buttons[i].buttonref;
                            button!.classList.toggle("selected", false);
                            button!.classList.toggle("unselected", true);
                            this.buttons[i].headerref!.classList.toggle("selection", false);
                            this.buttons[i].headerref!.classList.toggle("unselection", true);
                        }
                    }
                    this.selections = [];
                    this.newselect = [];
                }
            }
        }
    }

    @action
    previewHeight(color: string) {
        if (color === "#ffff80") { return "81%"; }
        if (color === "#bfff80") { return "82%"; }
        if (color === "#ff8080") { return "83%"; }
        if (color === "#80dfff") { return "84%"; }
        return "80%";
    }

    @action
    onPointerMove_Selector = (e: PointerEvent) => {
        if (e.pageY > document.body.clientHeight * 0.61) {
            if (e.pageY < document.body.clientHeight * 0.79) {
                this._lastY = e.pageY;
            }
            else {
                this._lastY = document.body.clientHeight * 0.79;
            }
        }
        else {
            this._lastY = document.body.clientHeight * 0.61;
        }
        this._lastX = e.pageX;

        let doc = this.markerDocs[this.markerDocs.length - 1];
        if (e.altKey) {
            let newX = doc.initialWidth;
            let newX2 = doc.initialMapWidth;
            let newmapwidth = newX2 + e.movementX / (this.barwidth / (this.barwidth - this.rightbound - this.leftbound));
            let newwidth = newX + e.movementX;
            doc.initialWidth = newwidth;
            doc.initialMapWidth = newmapwidth;
        }

        if (!e.altKey) {
            this.marqueeSelect();
            if (Math.abs(this._lastX - this._downX) > Utils.DRAG_THRESHOLD ||
                Math.abs(this._lastY - this._downY) > Utils.DRAG_THRESHOLD) {
                this._visible = true;
                e.stopPropagation();
                e.preventDefault();
            }
        }
    }

    @action
    onPointerUp_Selector = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onPointerMove_Selector, true);
        if (this._visible) {
            if (!e.shiftKey) {
                SelectionManager.DeselectAll(undefined);
            }
        }
        this._visible = false;
        for (let i = 0; i < this.newselect.length; i++) {
            if (!this.selections.includes(this.newselect[i])) {
                this.selections.push(this.newselect[i]);
            }
        }
    }

    private newselect: (HTMLDivElement | undefined)[] = [];

    marqueeSelect() {
        let newselect = [];
        if (this.marqueeref.current !== null) {
            let posInfo = this.marqueeref.current.getBoundingClientRect();
            for (let i = 0; i < this.buttons.length; i++) {
                if (this.buttons[i].buttonref !== undefined) {
                    let button = this.buttons[i].buttonref;
                    let buttoninfo = button!.getBoundingClientRect();
                    let header = this.buttons[i].headerref;
                    if ((buttoninfo.left > posInfo.left && buttoninfo.left < posInfo.right) || (buttoninfo.right > posInfo.left && buttoninfo.right < posInfo.right)) {
                        this.focus(button, header);
                        newselect.push(button);
                    }
                    else {
                        this.unfocus(button, header);
                    }
                    for (let j = 0; j < this.selections.length; j++) {
                        if (this.selections[j] === button) {
                            this.focus(button, header);
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

    focus(button: HTMLDivElement | undefined, header: HTMLDivElement | undefined) {
        button!.classList.toggle("selected", true);
        button!.classList.toggle("unselected", false);
        header!.classList.toggle("selection", true);
        header!.classList.toggle("unselection", false);
    }

    unfocus(button: HTMLDivElement | undefined, header: HTMLDivElement | undefined) {
        button!.classList.toggle("selected", false);
        button!.classList.toggle("unselected", true);
        header!.classList.toggle("selection", false);
        header!.classList.toggle("unselection", true);
    }

    @action
    select(e: React.MouseEvent<HTMLDivElement>, d: Doc, b: HTMLDivElement | undefined, h: HTMLDivElement | undefined, i: number) {
        var button = undefined;
        var header = undefined;
        for (let i = 0; i < this.buttons.length; i++) {
            if (this.buttons[i].buttonref === b) {
                button = (this.buttons[i].buttonref);
                header = this.buttons[i].headerref;
            }
        }

        if (e.ctrlKey) {
            if (button!.classList.contains("selected")) {
                this.unfocus(button, header);

                for (let i = 0; i < this.selections.length; i++) {
                    if (this.selections[i] === button) {
                        this.selections.splice(i, 1);
                    }
                }
            }
            else {
                this.focus(button, header);
                this.selections.push(button);
            }
        }
        else {
            if (button!.classList.contains("selected")) {
                for (let j = 0; j < this.selections.length; j++) {
                    this.selections[j]!.classList.toggle("selected", false);
                    this.selections[j]!.classList.toggle("unselected", true);
                }
                for (let j = 0; j < this.buttons.length; j++) {
                    this.buttons[j].headerref!.classList.toggle("selection", false);
                    this.buttons[j].headerref!.classList.toggle("unselection", true);
                }

                this.selections = [];
            }
            else {
                for (let j = 0; j < this.selections.length; j++) {
                    this.selections[j]!.classList.toggle("selected", false);
                    this.selections[j]!.classList.toggle("unselected", true);
                }
                for (let j = 0; j < this.buttons.length; j++) {
                    this.buttons[j].headerref!.classList.toggle("selection", false);
                    this.buttons[j].headerref!.classList.toggle("unselection", true);
                }
                this.focus(button, header);
                this.selections = [];
                this.selections.push(button);
            }
        }
        this.show(d);
    }

    @action
    show(d: Doc) {
        this.preview = d;
        if (this.sortstate === "creationDate") {
            this.preview4 = d.creationDate.date;
        }
        else {
            this.preview4 = d[this.sortstate];
        }
    }

    private _values: CompoundValue[] = [];
    private ticks: JSX.Element[] = [];
    private buttons: Node[] = [];

    private filterDocs = (oldbuttons: Node[]): Node[] => {
        let buttons = [];
        for (let i = 0; i < oldbuttons.length; i++) {
            if (this.filtered.includes("Image")) { if (oldbuttons[i].data instanceof ImageField) { buttons.push(oldbuttons[i]); } }
            if (this.filtered.includes("Audio")) { if (oldbuttons[i].data instanceof AudioField) { buttons.push(oldbuttons[i]); } }
            if (this.filtered.includes("Pdf")) { if (oldbuttons[i].data instanceof PdfField) { buttons.push(oldbuttons[i]); } }
            if (this.filtered.includes("Text")) { if (oldbuttons[i].data instanceof RichTextField) { buttons.push(oldbuttons[i]); } }
            if (this.filtered.includes("Video")) { if (oldbuttons[i].data instanceof VideoField) { buttons.push(oldbuttons[i]); } }
            if (this.filtered.includes("Web")) { if (oldbuttons[i].data instanceof WebField) { buttons.push(oldbuttons[i]); } }
            else if (this.filtered.includes("Misc")) { buttons.push(oldbuttons[i]); }
        }
        return buttons;
    }

    buttonloop() {
        this._range = 1;
        let arr: Doc[] = [];
        //Build an array of all nodes in dash document.
        this.childDocs.map((d) => { arr.push(d); });
        //filter based on 
        let backup = arr.filter(doc => doc[this.sortstate]);

        let keyvalue: DocTuple[] = [];

        if (backup.length > 0) {
            if (this.sortstate === "creationDate") {
                keyvalue = backup.map(d => {
                    let vdate: DateField = d.creationDate;
                    let value = new Date(vdate.date);
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
        let i = values.length - 1;
        this._range = (values[i] - values[0]);
        if (this._range === 0) {
            this._range = values.length;
        }
        if (isNaN(this._range)) {
            this._range = values.length;
            for (let i = 0; i < values.length; i++) {
                values[i] = String(i);
            }
        }
        this._values = values;
        let leftval = "0";
        let overlaps = [];
        this.buttons = [];


        for (let i = 0; i < backup.length; i++) {
            let icon = this.checkData(backup[i]);
            leftval = (((values[i] - values[0]) * this.barwidth * 0.97 / this._range) * (this.barwidth / (this.barwidth - this.rightbound - this.leftbound)) - (this.leftbound * (this.barwidth) / (this.barwidth - this.rightbound - this.leftbound))) + "px";
            let display = (e: React.MouseEvent<HTMLDivElement>, b: HTMLDivElement | undefined, h: HTMLDivElement | undefined) => { this.select(e, keyvalue[i].doc, b, h, i) };
            let overlap = false;
            let thingies = [];
            for (let j = 0; j < backup.length; j++) {
                if (j !== i) {
                    if (values[i] === values[j]) {
                        icon = faPlus;
                        display = (e: React.MouseEvent<HTMLDivElement>, b: HTMLDivElement | undefined, h: HTMLDivElement | undefined) => { this.select(e, keyvalue[i].doc, b, h, i); };
                        overlap = true;
                        thingies.push(
                            <button className="toolbar-button round-button" title="Notifs"
                                onClick={() => this.show(docs[j])}
                                style={{
                                    background: "$dark-color",
                                }}>
                                <FontAwesomeIcon icon={this.checkData(docs[j])} size="sm" />
                            </button>
                        );
                    }
                }
            }
            overlaps.push(thingies);

            //Creating the node
            let newbutton = undefined;
            if (overlap === false) {
                newbutton =
                    <div onClick={(e) => display(e, newNode.buttonref, newNode.headerref)} style={{ position: "absolute", left: leftval, width: "100px", height: "100px" }}>
                        <div ref={(el) => el ? newNode.buttonref = el : null} className="unselected" style={{ position: "absolute", width: "100px", height: "100px", pointerEvents: "all" }}>
                            <FontAwesomeIcon icon={this.checkData(docs[i])} size="sm" style={{ position: "absolute" }} />
                            <div className="window" style={{ pointerEvents: "none", zIndex: 10, width: "94px", height: "94px", position: "absolute" }}></div>
                            <div className="window" style={{ background: "white", pointerEvents: "none", zIndex: -1, position: "absolute", width: "94px", height: "94px" }}>
                                {this.documentpreview4(docs[i], 94, 94)}
                            </div>
                        </div>
                    </div>;
            }
            else {
                newbutton =
                    <div ref={(el) => el ? newNode.buttonref = el : null} onClick={(e) => display(e, newNode.buttonref, newNode.headerref)} style={{ position: "absolute", left: leftval, width: "100px", height: "100px" }}>
                        <div className="unselected" style={{ position: "absolute", overflow: "scroll", background: "grey", width: "100px", height: "100px", zIndex: 0 }}>
                            {thingies}
                        </div>
                    </div>;
            }
            let newNode: Node = {
                button: newbutton,
                buttonref: undefined,
                header: (
                    <div ref={(el) => el ? newNode.headerref = el : null} className="unselection" onPointerDown={this.onPointerDown_Selector} style={{
                        whiteSpace: "nowrap", borderRadius: "5px 5px 0px 0px", border: "1px",
                        textOverflow: "ellipsis", overflow: "hidden", paddingLeft: "3px", paddingRight: "3px", paddingTop: "3px", top: "-28px", zIndex: 99, position: "absolute", left: leftval, width: "100px", height: "30px"
                    }}>
                        {docs[i].title}
                    </div>
                ),
                headerref: undefined,
                map: (
                    <div ref={(el) => el ? newNode.mapref = el : null}
                        style={{
                            position: "absolute",
                            background: "black",
                            zIndex: 1,
                            top: "25%", left: ((values[i] - values[0]) * this.barwidth / this._range) * 0.97 + "px", width: "5px", border: "3px solid"
                        }}>
                    </div>),
                mapref: undefined,
                data: docs[i].data,
            };
            this.buttons.push(newNode);
        }
        this.buttons = this.filterDocs(this.buttons);
    }

    private fields: JSX.Element[] = [];
    sortmenu() {
        this.fields = [];
        let keys: { [key: string]: boolean } = {};
        const docs2 = DocListCast(this.props.Document[this.props.fieldKey]);
        untracked(() => docs2.map(doc => Doc.GetAllPrototypes(doc).map(proto => Object.keys(proto).forEach(key => keys[key] = false))));
        this.fellas = Array.from(Object.keys(keys)).map(item => item === this.sortstate ? true : false);
        for (let i = 0; i < Object.keys(keys).length; i++) {
            let item = Object.keys(keys)[i];
            let guy = React.createRef<HTMLInputElement>();
            this.fields.push(<div>
                <input type="radio" ref={guy} checked={this.fellas[i]} onChange={() => this.toggleKey(item, i, guy)} />
                {item}
            </div>);
        }
    }

    createticks() {
        //Creates the array of tick marks.
        let counter = 0;
        this.ticks = [];
        for (let i = 0; i < this.barwidth; i += this.barwidth / 1000) {
            let leftval = ((i * (this.barwidth / (this.barwidth - this.rightbound - this.leftbound)) - (this.leftbound * (this.barwidth) / (this.barwidth - this.rightbound - this.leftbound))) + "px");
            if (counter % 100 === 0) { this.ticks.push(<div className="max" style={{ position: "absolute", top: "0%", left: leftval, zIndex: -100 }} />); }
            else if (counter % 50 === 0) { this.ticks.push(<div className="max2" style={{ position: "absolute", top: "0%", left: leftval, zIndex: -100 }} />); }
            else if (counter % 10 === 0) { this.ticks.push(<div className="active" style={{ position: "absolute", top: "0%", left: leftval, zIndex: -100 }} />); }
            else { this.ticks.push(<div className="inactive" style={{ position: "absolute", top: "0%", left: leftval, zIndex: -100 }} />); }
            counter++;
        }
    }

    @action
    onKeyPress_Selector = (e: React.KeyboardEvent) => {
        e.preventDefault;
        if (e.altKey && this.selections.length > 0) {
            let min = 9999999;
            let max = -999999;
            for (let i = 0; i < this.selections.length; i++) {
                min = this.selections[i].getBoundingClientRect().left < min ? this.selections[i].getBoundingClientRect().left : min;
                max = this.selections[i].getBoundingClientRect().right > max ? this.selections[i].getBoundingClientRect().right : max;
            }
            let d = new Doc;
            d.initialLeft = ((min - 3 - document.body.clientWidth + this.screenref.current!.clientWidth / 0.98) / (this.barwidth / (this.barwidth - this.rightbound - this.leftbound))) + (this.leftbound);
            d.initialScale = (this.barwidth / (this.barwidth - this.rightbound - this.leftbound));
            d.initialWidth = Math.abs(max - min);
            d.initialX = this.leftbound;
            d.initilMapLeft = ((((min - 3 - document.body.clientWidth + this.screenref.current!.clientWidth / 0.98) / this.barref.current.clientWidth)) * (this.barwidth - this.rightbound - this.leftbound)) + this.leftbound;
            d.initialMapWidth = (Math.abs(max - min));
            d.annotation = "Edit me!";
            d.color = this.selectedColor;
            this.markerDocs.push(d);
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

    documentpreview4(d: Doc, width: number, height: number) {
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
            <div className="collectionSchemaView-previewDoc" style={{ transform: `translate(${centeringOffset}px, 0px)`, width: width, height: "100%" }}>
                <DocumentView Document={d} isTopMost={false} selectOnLoad={false}
                    addDocument={this.props.addDocument} moveDocument={this.props.moveDocument}
                    ScreenToLocalTransform={getTransform}
                    ContentScaling={contentScaling}
                    PanelWidth={PanelWidth} PanelHeight={PanelHeight}
                    ContainingCollectionView={this.props.CollectionView}
                    focus={emptyFunction}
                    parentActive={this.props.active}
                    whenActiveChanged={this.props.whenActiveChanged}
                    bringToFront={emptyFunction}
                    addDocTab={this.props.addDocTab}
                />
            </div>);
    }

    private annotationRef = React.createRef<EditableView>();
    @observable private annotationText: string = "Select an annotation!";
    @observable private selectedMarker: MarkerUnit;
    @observable private selectedColor: string = "ffff80";

    @action annotationUpdate = (newValue: string) => {
        this.annotationText = newValue;
        this.selectedMarker.document.annotation = newValue;
        return true;
    }
    annotationPanel() {
        return (
            <div style={{ height: "100%", background: this.selectedColor ? this.selectedColor : "white" }}>
                <EditableView ref={this.annotationRef}
                    contents={this.annotationText}
                    SetValue={this.annotationUpdate}
                    GetValue={() => ""}
                    display={"inline"}
                    height={72}
                />
            </div >
        );
    }

    @observable private barwidth = (this.barref.current ? this.barref.current.clientWidth : (952));
    @observable private leftbound = 0;
    @observable private rightbound = 0;

    @action
    updateWidth() {
        this.barwidth = (this.barref.current ? this.barref.current.clientWidth : (952));
    }

    leftboundSet = (number: number) => { this.leftbound = number; this.markerrender(); };
    rightboundSet = (number: number) => { this.rightbound = number; this.markerrender(); };
    selectedColorSet = (color: string) => { this.selectedColor = color; };
    barwidthSet = (color: number) => { this.barwidth = color; this.markerrender(); };

    render() {
        this.updateWidth();
        this.createticks();
        this.filtermenu();
        this.sortmenu();
        this.buttonloop();
        let p: [number, number] = this._visible ? this.props.ScreenToLocalTransform().translate(0, 0).transformPoint(this._downX < this._lastX ? this._downX : this._lastX, this._downY < this._lastY ? this._downY : this._lastY) : [0, 0];
        return (
            <div className="collectionTimelineView" ref={this.screenref} style={{ marginLeft: "1%", width: "98%", height: "100%" }} onWheel={(e: React.WheelEvent) => e.stopPropagation()}>
                <div style={{ position: "absolute", height: "30%", width: "10%", overflow: "scroll", border: "1px solid", zIndex: 900 }}>
                    <h5><b>Sort</b></h5>
                    <div>{this.fields}</div>
                </div>
                <div style={{ position: "absolute", top: "30%", height: "30%", width: "10%", overflow: "scroll", border: "1px solid", zIndex: 900 }}>
                    <h5><b>Filter</b></h5>
                    {this.newdudes}
                </div>
                <div className="timeline" style={{ position: "absolute", height: "25px", width: "100%", top: String(document.body.clientHeight * 0.65 + 72) + "px", zIndex: -9999 }}>
                    {this.ticks}
                </div>
                <div style={{ left: "10%", width: "60%", height: "60%", background: "white", pointerEvents: "none", position: "absolute", border: "1px solid" }}>
                    {this.preview ? this.documentpreview4(this.preview, this.barwidth / 2, 500) : (null)}
                </div>
                <div style={{ left: "70%", height: "30%", pointerEvents: "none", background: "white", position: "absolute", border: "1px solid", width: "30%" }}>
                    {this.preview ? this.documentpreview4(Docs.KVPDocument(this.preview, {}), this.barwidth * 0.3, document.body.clientHeight * 0.59) : (null)}
                </div>
                <div style={{ left: "70%", top: "30%", height: "30%", position: "absolute", border: "1px solid", width: "30%" }}>
                    {this.annotationPanel()}
                </div>
                {this.markerDocs.map(d => this.createmarker(d))}
                {this.markerDocs.map(d => this.createmap(d))}
                <BottomUI
                    buttonmap={this.buttons.map(item => item.map)}
                    leftbound={this.leftbound}
                    rightbound={this.rightbound}
                    leftboundSet={this.leftboundSet}
                    rightboundSet={this.rightboundSet}
                    _range={this._range}
                    barwidth={this.barwidth}
                    minvalue={this._values[0]}
                    sortstate={this.sortstate}
                    selectedvalue={this.preview4}
                    selectedColor={this.selectedColor}
                    selectedColorSet={this.selectedColorSet}
                    barref={this.barref}
                    barwidthSet={this.barwidthSet}
                    screenref={this.screenref}
                    markerrender={this.markerrender}>
                </BottomUI>
                <Measure onResize={() => this.updateWidth()}>
                    {({ measureRef }) => <div ref={measureRef}> </div>}
                </Measure>
                <div className="marqueeView" style={{ height: "40%", top: "60%", borderRadius: "inherit", position: "absolute", width: "100%", }} onPointerDown={this.onPointerDown_Selector} onKeyDown={this.onKeyPress_Selector}>
                    {<div style={{ transform: `translate(${p[0]}px, ${p[1] - 0.58 * (document.body.clientHeight)}px)` }} >
                        {this._visible ? this.marqueeDiv : null}
                    </div>}
                </div>
                <div style={{ top: "65%", position: "absolute", bottom: "25%" }}>{this.buttons.map(item => item.button)}{this.buttons.map(item => item.header)}</div>
            </div>
        );
    }
}
