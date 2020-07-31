import React = require("react");
import { observer } from "mobx-react";
import "./PropertiesView.scss";
import { observable, action, computed, runInAction } from "mobx";
import { Doc, Field, DocListCast, WidthSym, HeightSym, AclSym, AclPrivate, AclReadonly, AclAddonly, AclEdit, AclAdmin, Opt } from "../../../../fields/Doc";
import { DocumentView } from "../../nodes/DocumentView";
import { ComputedField } from "../../../../fields/ScriptField";
import { EditableView } from "../../EditableView";
import { KeyValueBox } from "../../nodes/KeyValueBox";
import { Cast, NumCast, StrCast } from "../../../../fields/Types";
import { listSpec } from "../../../../fields/Schema";
import { ContentFittingDocumentView } from "../../nodes/ContentFittingDocumentView";
import { returnFalse, returnOne, emptyFunction, emptyPath, returnTrue, returnZero, returnEmptyFilter, Utils } from "../../../../Utils";
import { Id } from "../../../../fields/FieldSymbols";
import { Transform } from "../../../util/Transform";
import { PropertiesButtons } from "../../PropertiesButtons";
import { SelectionManager } from "../../../util/SelectionManager";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip, Checkbox } from "@material-ui/core";
import SharingManager from "../../../util/SharingManager";
import { DocumentType } from "../../../documents/DocumentTypes";
import FormatShapePane from "./FormatShapePane";
import { SharingPermissions, GetEffectiveAcl } from "../../../../fields/util";
import { InkField } from "../../../../fields/InkField";
import { undoBatch } from "../../../util/UndoManager";
import { ColorState, SketchPicker } from "react-color";
import AntimodeMenu from "../../AntimodeMenu";
import "./FormatShapePane.scss";


interface PropertiesViewProps {
    width: number;
    height: number;
    renderDepth: number;
    ScreenToLocalTransform: () => Transform;
    onDown: (event: any) => void;
}

@observer
export class PropertiesView extends React.Component<PropertiesViewProps> {

    @computed get MAX_EMBED_HEIGHT() { return 200; }

    @computed get selectedDocumentView() {
        if (SelectionManager.SelectedDocuments().length) {
            return SelectionManager.SelectedDocuments()[0];
        } else { return undefined; }
    }
    @computed get selectedDoc() { return this.selectedDocumentView?.rootDoc; }
    @computed get dataDoc() { return this.selectedDocumentView?.dataDoc; }

    @observable layoutFields: boolean = false;

    @observable openActions: boolean = true;
    @observable openSharing: boolean = true;
    @observable openFields: boolean = true;
    @observable openLayout: boolean = true;
    @observable openAppearance: boolean = true;
    @observable openTransform: boolean = true;

    @computed get isInk() { return this.selectedDoc?.type === DocumentType.INK; }

    @action
    rtfWidth = () => {
        if (this.selectedDoc) {
            return Math.min(this.selectedDoc?.[WidthSym](), this.props.width - 20);
        } else {
            return 0;
        }
    }
    @action
    rtfHeight = () => {
        if (this.selectedDoc) {
            return this.rtfWidth() <= this.selectedDoc?.[WidthSym]() ? Math.min(this.selectedDoc?.[HeightSym](), this.MAX_EMBED_HEIGHT) : this.MAX_EMBED_HEIGHT;
        } else {
            return 0;
        }
    }

    @action
    docWidth = () => {
        if (this.selectedDoc) {
            const layoutDoc = this.selectedDoc;
            const aspect = NumCast(layoutDoc._nativeHeight, layoutDoc._fitWidth ? 0 : layoutDoc[HeightSym]()) / NumCast(layoutDoc._nativeWidth, layoutDoc._fitWidth ? 1 : layoutDoc[WidthSym]());
            if (aspect) return Math.min(layoutDoc[WidthSym](), Math.min(this.MAX_EMBED_HEIGHT / aspect, this.props.width - 20));
            return NumCast(layoutDoc._nativeWidth) ? Math.min(layoutDoc[WidthSym](), this.props.width - 20) : this.props.width - 20;
        } else {
            return 0;
        }
    }

    @action
    docHeight = () => {
        if (this.selectedDoc && this.dataDoc) {
            const layoutDoc = this.selectedDoc;
            return Math.max(70, Math.min(this.MAX_EMBED_HEIGHT, (() => {
                const aspect = NumCast(layoutDoc._nativeHeight, layoutDoc._fitWidth ? 0 : layoutDoc[HeightSym]()) / NumCast(layoutDoc._nativeWidth, layoutDoc._fitWidth ? 1 : layoutDoc[WidthSym]());
                if (aspect) return this.docWidth() * aspect;
                return layoutDoc._fitWidth ? (!this.dataDoc._nativeHeight ? NumCast(this.props.height) :
                    Math.min(this.docWidth() * NumCast(layoutDoc.scrollHeight, NumCast(layoutDoc._nativeHeight)) / NumCast(layoutDoc._nativeWidth,
                        NumCast(this.props.height)))) :
                    NumCast(layoutDoc._height) ? NumCast(layoutDoc._height) : 50;
            })()));
        } else {
            return 0;
        }
    }

    @computed get expandedField() {
        if (this.dataDoc && this.selectedDoc) {
            const ids: { [key: string]: string } = {};
            const doc = this.layoutFields ? Doc.Layout(this.selectedDoc) : this.dataDoc;
            doc && Object.keys(doc).forEach(key => !(key in ids) && doc[key] !== ComputedField.undefined && (ids[key] = key));
            const rows: JSX.Element[] = [];
            for (const key of Object.keys(ids).slice().sort()) {
                const contents = doc[key];
                if (contents === "UNDEFINED") {
                    rows.push(<div style={{ display: "flex", overflowY: "visible", marginBottom: "2px" }} key={key}>
                        <span style={{ fontWeight: "bold", whiteSpace: "nowrap" }}>{key}</span>
                    &nbsp;
                </div>);
                } else {
                    let contentElement: (JSX.Element | null)[] | JSX.Element = [];
                    contentElement = <EditableView key="editableView"
                        contents={contents !== undefined ? Field.toString(contents as Field) : "null"}
                        height={13}
                        fontSize={10}
                        GetValue={() => Field.toKeyValueString(doc, key)}
                        SetValue={(value: string) => KeyValueBox.SetField(doc, key, value, true)}
                    />;
                    rows.push(<div style={{ display: "flex", overflowY: "visible", marginBottom: "-1px" }} key={key}>
                        <span style={{ fontWeight: "bold", whiteSpace: "nowrap" }}>{key + ":"}</span>
                        &nbsp;
                        {contentElement}
                    </div>);
                }
            }
            rows.push(<div className="field" key={"newKeyValue"} style={{ marginTop: "3px" }}>
                <EditableView
                    key="editableView"
                    contents={"add key:value or #tags"}
                    height={13}
                    fontSize={10}
                    GetValue={() => ""}
                    SetValue={this.setKeyValue} />
            </div>);
            return rows;
        }
    }

    @computed get noviceFields() {
        if (this.dataDoc && this.selectedDoc) {
            const ids: { [key: string]: string } = {};
            const doc = this.dataDoc;
            doc && Object.keys(doc).forEach(key => !(key in ids) && doc[key] !== ComputedField.undefined && (ids[key] = key));
            const rows: JSX.Element[] = [];
            for (const key of Object.keys(ids).slice().sort()) {
                if (key[0] === key[0].toUpperCase() || key[0] === "#" || key === "author" || key === "creationDate" || key.indexOf("lastModified") !== -1) {
                    const contents = doc[key];
                    if (contents === "UNDEFINED") {
                        rows.push(<div className="uneditable-field" key={key}>
                            <span style={{ fontWeight: "bold", whiteSpace: "nowrap" }}>{key}</span>
                    &nbsp;
                </div>);
                    } else {
                        const value = Field.toString(contents as Field);
                        if (key === "author" || key === "creationDate" || key.indexOf("lastModified") !== -1) {
                            rows.push(<div className="uneditable-field" key={key}>
                                <span style={{ fontWeight: "bold", whiteSpace: "nowrap" }}>{key + ": "}</span>
                                <div style={{ whiteSpace: "nowrap", overflowX: "hidden" }}>{value}</div>
                            </div>);
                        } else {
                            let contentElement: (JSX.Element | null)[] | JSX.Element = [];
                            contentElement = <EditableView key="editableView"
                                contents={contents !== undefined ? Field.toString(contents as Field) : "null"}
                                height={13}
                                fontSize={10}
                                GetValue={() => Field.toKeyValueString(doc, key)}
                                SetValue={(value: string) => KeyValueBox.SetField(doc, key, value, true)}
                            />;

                            rows.push(<div style={{ display: "flex", overflowY: "visible", marginBottom: "-1px" }} key={key}>
                                <span style={{ fontWeight: "bold", whiteSpace: "nowrap" }}>{key + ":"}</span>
                            &nbsp;
                            {contentElement}
                            </div>);
                        }
                    }
                }
            }
            rows.push(<div className="field" key={"newKeyValue"} style={{ marginTop: "3px" }}>
                <EditableView
                    key="editableView"
                    contents={"add key:value or #tags"}
                    height={13}
                    fontSize={10}
                    GetValue={() => ""}
                    SetValue={this.setKeyValue} />
            </div>);
            return rows;
        }
    }


    setKeyValue = (value: string) => {
        if (this.selectedDoc && this.dataDoc) {
            const doc = this.layoutFields ? Doc.Layout(this.selectedDoc) : this.dataDoc;
            if (value.indexOf(":") !== -1) {
                const newVal = value[0].toUpperCase() + value.substring(1, value.length);
                KeyValueBox.SetField(doc, newVal.substring(0, newVal.indexOf(":")), newVal.substring(newVal.indexOf(":") + 1, newVal.length), true);
                return true;
            } else if (value[0] === "#") {
                const newVal = value + ":'UNDEFINED'";
                KeyValueBox.SetField(doc, newVal.substring(0, newVal.indexOf(":")), newVal.substring(newVal.indexOf(":") + 1, newVal.length), true);
                return true;
            }
        }
        return false;
    }

    @computed get layoutPreview() {
        if (this.selectedDoc) {
            const layoutDoc = Doc.Layout(this.selectedDoc);
            const panelHeight = StrCast(Doc.LayoutField(layoutDoc)).includes("FormattedTextBox") ? this.rtfHeight : this.docHeight;
            const panelWidth = StrCast(Doc.LayoutField(layoutDoc)).includes("FormattedTextBox") ? this.rtfWidth : this.docWidth;
            return <div style={{ display: "inline-block", height: panelHeight() }} key={this.selectedDoc[Id]}>
                <ContentFittingDocumentView
                    Document={layoutDoc}
                    DataDoc={this.dataDoc}
                    LibraryPath={emptyPath}
                    renderDepth={this.props.renderDepth + 1}
                    rootSelected={returnFalse}
                    treeViewDoc={undefined}
                    backgroundColor={() => "lightgrey"}
                    fitToBox={false}
                    FreezeDimensions={true}
                    NativeWidth={layoutDoc.type ===
                        StrCast(Doc.LayoutField(layoutDoc)).includes("FormattedTextBox") ? this.rtfWidth : returnZero}
                    NativeHeight={layoutDoc.type ===
                        StrCast(Doc.LayoutField(layoutDoc)).includes("FormattedTextBox") ? this.rtfHeight : returnZero}
                    PanelWidth={panelWidth}
                    PanelHeight={panelHeight}
                    focus={returnFalse}
                    ScreenToLocalTransform={this.props.ScreenToLocalTransform}
                    docFilters={returnEmptyFilter}
                    ContainingCollectionDoc={undefined}
                    ContainingCollectionView={undefined}
                    addDocument={returnFalse}
                    moveDocument={undefined}
                    removeDocument={returnFalse}
                    parentActive={() => false}
                    whenActiveChanged={emptyFunction}
                    addDocTab={returnFalse}
                    pinToPres={emptyFunction}
                    bringToFront={returnFalse}
                    ContentScaling={returnOne}
                />
            </div>;
        } else {
            return null;
        }
    }

    getPermissionsSelect(user: string) {
        return <select className="permissions-select"
            onChange={e => SharingManager.Instance.shareFromPropertiesSidebar(user, e.currentTarget.value as SharingPermissions, this.selectedDoc!)}>
            {Object.values(SharingPermissions).map(permission => {
                return (
                    <option key={permission} value={permission} selected={this.selectedDoc![`ACL-${user.replace(".", "_")}`] === permission}>
                        {permission}
                    </option>);
            })}
        </select>;
    }

    @computed get notifyIcon() {
        return <Tooltip title={<><div className="dash-tooltip">Notify with message</div></>}>
            <div className="notify-button">
                <FontAwesomeIcon className="notify-button-icon" icon="bell" color="white" size="sm" />
            </div>
        </Tooltip>;
    }

    @computed get expansionIcon() {
        return <Tooltip title={<><div className="dash-tooltip">{"Show more permissions"}</div></>}>
            <div className="expansion-button" onPointerDown={() => {
                if (this.selectedDocumentView) {
                    SharingManager.Instance.open(this.selectedDocumentView);
                }
            }}>
                <FontAwesomeIcon className="expansion-button-icon" icon="ellipsis-h" color="black" size="sm" />
            </div>
        </Tooltip>;
    }

    sharingItem(name: string, effectiveAcl: symbol, permission?: string) {
        return <div className="propertiesView-sharingTable-item">
            <div className="propertiesView-sharingTable-item-name" style={{ width: name !== "Me" ? "70px" : "80px" }}> {name} </div>
            {name !== "Me" ? this.notifyIcon : null}
            <div className="propertiesView-sharingTable-item-permission">
                {effectiveAcl === AclAdmin && permission !== "Owner" ? this.getPermissionsSelect(name) : permission}
                {permission === "Owner" ? this.expansionIcon : null}
            </div>
        </div>;
    }

    @computed get sharingTable() {
        const AclMap = new Map<symbol, string>([
            [AclPrivate, SharingPermissions.None],
            [AclReadonly, SharingPermissions.View],
            [AclAddonly, SharingPermissions.Add],
            [AclEdit, SharingPermissions.Edit],
            [AclAdmin, SharingPermissions.Admin]
        ]);

        const effectiveAcl = GetEffectiveAcl(this.selectedDoc!);
        const tableEntries = [];

        if (this.selectedDoc![AclSym]) {
            for (const [key, value] of Object.entries(this.selectedDoc![AclSym])) {
                const name = key.substring(4).replace("_", ".");
                if (name !== Doc.CurrentUserEmail && name !== this.selectedDoc!.author) tableEntries.push(this.sharingItem(name, effectiveAcl, AclMap.get(value)!));
            }
        }

        tableEntries.unshift(this.sharingItem("Me", effectiveAcl, Doc.CurrentUserEmail === this.selectedDoc!.author ? "Owner" : StrCast(this.selectedDoc![`ACL-${Doc.CurrentUserEmail.replace(".", "_")}`])));
        if (Doc.CurrentUserEmail !== this.selectedDoc!.author) tableEntries.unshift(this.sharingItem(StrCast(this.selectedDoc!.author), effectiveAcl, "Owner"));

        return <div className="propertiesView-sharingTable">
            {tableEntries}
        </div>;
    }

    @computed get fieldsCheckbox() {
        return <Checkbox
            color="primary"
            onChange={this.toggleCheckbox}
            checked={this.layoutFields}
        />;
    }

    @action
    toggleCheckbox = () => {
        this.layoutFields = !this.layoutFields;
    }

    @computed get editableTitle() {
        return <EditableView
            key="editableView"
            contents={StrCast(this.selectedDoc?.title)}
            height={25}
            fontSize={14}
            GetValue={() => StrCast(this.selectedDoc?.title)}
            SetValue={this.setTitle} />;
    }

    @action
    setTitle = (value: string) => {
        if (this.dataDoc) {
            this.selectedDoc && (this.selectedDoc.title = value);
            KeyValueBox.SetField(this.dataDoc, "title", value, true);
            return true;
        }
        return false;
    }









    @undoBatch
    @action
    rotate = (angle: number) => {
        const _centerPoints: { X: number, Y: number }[] = [];
        if (this.selectedDoc) {
            const doc = this.selectedDoc;
            if (doc.type === DocumentType.INK && doc.x && doc.y && doc._width && doc._height && doc.data) {
                const ink = Cast(doc.data, InkField)?.inkData;
                if (ink) {
                    const xs = ink.map(p => p.X);
                    const ys = ink.map(p => p.Y);
                    const left = Math.min(...xs);
                    const top = Math.min(...ys);
                    const right = Math.max(...xs);
                    const bottom = Math.max(...ys);
                    _centerPoints.push({ X: left, Y: top });
                }
            }

            var index = 0;
            if (doc.type === DocumentType.INK && doc.x && doc.y && doc._width && doc._height && doc.data) {
                doc.rotation = Number(doc.rotation) + Number(angle);
                const ink = Cast(doc.data, InkField)?.inkData;
                if (ink) {

                    const newPoints: { X: number, Y: number }[] = [];
                    for (var i = 0; i < ink.length; i++) {
                        const newX = Math.cos(angle) * (ink[i].X - _centerPoints[index].X) - Math.sin(angle) * (ink[i].Y - _centerPoints[index].Y) + _centerPoints[index].X;
                        const newY = Math.sin(angle) * (ink[i].X - _centerPoints[index].X) + Math.cos(angle) * (ink[i].Y - _centerPoints[index].Y) + _centerPoints[index].Y;
                        newPoints.push({ X: newX, Y: newY });
                    }
                    doc.data = new InkField(newPoints);
                    const xs = newPoints.map(p => p.X);
                    const ys = newPoints.map(p => p.Y);
                    const left = Math.min(...xs);
                    const top = Math.min(...ys);
                    const right = Math.max(...xs);
                    const bottom = Math.max(...ys);

                    doc._height = (bottom - top);
                    doc._width = (right - left);
                }
                index++;
            }
        }
    }

    @observable _controlBtn: boolean = false;
    @observable _lock: boolean = false;

    @computed
    get controlPointsButton() {
        return <div className="inking-button">
            <Tooltip title={<><div className="dash-tooltip">{"Edit points"}</div></>}>
                <div className="inking-button-points" onPointerDown={action(() => this._controlBtn = !this._controlBtn)} style={{ backgroundColor: this._controlBtn ? "black" : "" }}>
                    <FontAwesomeIcon icon="bezier-curve" color="white" size="lg" />
                </div>
            </Tooltip>
            <Tooltip title={<><div className="dash-tooltip">{this._lock ? "Unlock points" : "Lock points"}</div></>}>
                <div className="inking-button-lock" onPointerDown={action(() => this._lock = !this._lock)} >
                    <FontAwesomeIcon icon={this._lock ? "unlock" : "lock"} color="white" size="lg" />
                </div>
            </Tooltip>
            <Tooltip title={<><div className="dash-tooltip">{"Rotate 90˚"}</div></>}>
                <div className="inking-button-rotate" onPointerDown={action(() => this.rotate(Math.PI / 2))}>
                    <FontAwesomeIcon icon="undo" color="white" size="lg" />
                </div>
            </Tooltip>
        </div>;
    }

    inputBox = (key: string, value: any, setter: (val: string) => {}, title: string) => {
        return <div className="inputBox"
            style={{
                marginRight: title === "X:" ? "19px" : "",
                marginLeft: title === "∠:" ? "39px" : ""
            }}>
            <div className="inputBox-title"> {title} </div>
            <input className="inputBox-input"
                type="text" value={value}
                onChange={e => setter(e.target.value)} />
            <div className="inputBox-button">
                <div className="inputBox-button-up" key="up2"
                    onPointerDown={undoBatch(action(() => this.upDownButtons("up", key)))} >
                    <FontAwesomeIcon icon="caret-up" color="white" size="sm" />
                </div>
                <div className="inputbox-Button-down" key="down2"
                    onPointerDown={undoBatch(action(() => this.upDownButtons("down", key)))} >
                    <FontAwesomeIcon icon="caret-down" color="white" size="sm" />
                </div>
            </div>
        </div>;
    }

    inputBoxDuo = (key: string, value: any, setter: (val: string) => {}, title1: string, key2: string, value2: any, setter2: (val: string) => {}, title2: string) => {
        return <div className="inputBox-duo">
            {this.inputBox(key, value, setter, title1)}
            {title2 === "" ? (null) : this.inputBox(key2, value2, setter2, title2)}
        </div>;
    }

    @action
    upDownButtons = (dirs: string, field: string) => {
        switch (field) {
            case "rot": this.rotate((dirs === "up" ? .1 : -.1)); break;
            // case "rot": this.selectedInk?.forEach(i => i.rootDoc.rotation = NumCast(i.rootDoc.rotation) + (dirs === "up" ? 0.1 : -0.1)); break;
            case "Xps": this.selectedDoc && (this.selectedDoc.x = NumCast(this.selectedDoc?.x) + (dirs === "up" ? 10 : -10)); break;
            case "Yps": this.selectedDoc && (this.selectedDoc.y = NumCast(this.selectedDoc?.y) + (dirs === "up" ? 10 : -10)); break;
            case "stk": this.selectedDoc && (this.selectedDoc.strokeWidth = NumCast(this.selectedDoc?.strokeWidth) + (dirs === "up" ? .1 : -.1)); break;
            case "wid":
                const oldWidth = NumCast(this.selectedDoc?._width);
                const oldHeight = NumCast(this.selectedDoc?._height);
                const oldX = NumCast(this.selectedDoc?.x);
                const oldY = NumCast(this.selectedDoc?.y);
                this.selectedDoc && (this.selectedDoc._width = oldWidth + (dirs === "up" ? 10 : - 10));
                this._lock && this.selectedDoc && (this.selectedDoc._height = (NumCast(this.selectedDoc?._width) / oldWidth * NumCast(this.selectedDoc?._height)));
                const doc = this.selectedDoc;
                if (doc?.type === DocumentType.INK && doc.x && doc.y && doc._height && doc._width) {
                    console.log(doc.x, doc.y, doc._height, doc._width);
                    const ink = Cast(doc.data, InkField)?.inkData;
                    console.log(ink);
                    if (ink) {
                        const newPoints: { X: number, Y: number }[] = [];
                        for (var j = 0; j < ink.length; j++) {
                            // (new x — oldx) + (oldxpoint * newWidt)/oldWidth 
                            const newX = (NumCast(doc.x) - oldX) + (ink[j].X * NumCast(doc._width)) / oldWidth;
                            const newY = (NumCast(doc.y) - oldY) + (ink[j].Y * NumCast(doc._height)) / oldHeight;
                            newPoints.push({ X: newX, Y: newY });
                        }
                        doc.data = new InkField(newPoints);
                    }
                }
                break;
            case "hgt":
                const oWidth = NumCast(this.selectedDoc?._width);
                const oHeight = NumCast(this.selectedDoc?._height);
                const oX = NumCast(this.selectedDoc?.x);
                const oY = NumCast(this.selectedDoc?.y);
                this.selectedDoc && (this.selectedDoc._height = oHeight + (dirs === "up" ? 10 : - 10));
                this._lock && this.selectedDoc && (this.selectedDoc._width = (NumCast(this.selectedDoc?._height) / oHeight * NumCast(this.selectedDoc?._width)));
                const docu = this.selectedDoc;
                if (docu?.type === DocumentType.INK && docu.x && docu.y && docu._height && docu._width) {
                    console.log(docu.x, docu.y, docu._height, docu._width);
                    const ink = Cast(docu.data, InkField)?.inkData;
                    console.log(ink);
                    if (ink) {
                        const newPoints: { X: number, Y: number }[] = [];
                        for (var j = 0; j < ink.length; j++) {
                            // (new x — oldx) + (oldxpoint * newWidt)/oldWidth 
                            const newX = (NumCast(docu.x) - oX) + (ink[j].X * NumCast(docu._width)) / oWidth;
                            const newY = (NumCast(docu.y) - oY) + (ink[j].Y * NumCast(docu._height)) / oHeight;
                            newPoints.push({ X: newX, Y: newY });
                        }
                        docu.data = new InkField(newPoints);
                    }
                }
                break;
        }
    }

    getField(key: string) {
        //if (this.selectedDoc) {
        return Field.toString(this.selectedDoc[key] as Field);
        // } else {
        //     return undefined as Opt<string>;
        // }
    }

    @computed get shapeXps() { return this.getField("x"); }
    @computed get shapeYps() { return this.getField("y"); }
    @computed get shapeRot() { return this.getField("rotation"); }
    @computed get shapeHgt() { return this.getField("_height"); }
    @computed get shapeWid() { return this.getField("_width"); }
    set shapeXps(value) { this.selectedDoc && (this.selectedDoc.x = Number(value)); }
    set shapeYps(value) { this.selectedDoc && (this.selectedDoc.y = Number(value)); }
    set shapeRot(value) { this.selectedDoc && (this.selectedDoc.rotation = Number(value)); }
    set shapeWid(value) {
        const oldWidth = NumCast(this.selectedDoc?._width);
        this.selectedDoc && (this.selectedDoc._width = Number(value));
        this._lock && this.selectedDoc && (this.selectedDoc._height = (NumCast(this.selectedDoc?._width) * NumCast(this.selectedDoc?._height)) / oldWidth);
    }
    set shapeHgt(value) {
        const oldHeight = NumCast(this.selectedDoc?._height);
        this.selectedDoc && (this.selectedDoc._height = Number(value));
        this._lock && this.selectedDoc && (this.selectedDoc._width = (NumCast(this.selectedDoc?._height) * NumCast(this.selectedDoc?._width)) / oldHeight);
    }

    @computed get hgtInput() { return this.inputBoxDuo("hgt", this.shapeHgt, (val: string) => this.shapeHgt = val, "H:", "wid", this.shapeWid, (val: string) => this.shapeWid = val, "W:"); }
    @computed get XpsInput() { return this.inputBoxDuo("Xps", this.shapeXps, (val: string) => this.shapeXps = val, "X:", "Yps", this.shapeYps, (val: string) => this.shapeYps = val, "Y:"); }
    @computed get rotInput() { return this.inputBoxDuo("rot", this.shapeRot, (val: string) => { this.rotate(Number(val) - Number(this.shapeRot)); this.shapeRot = val; return true; }, "∠:", "rot", this.shapeRot, (val: string) => this.shapeRot = val, ""); }






    @computed get appearanceEditor() { return "appearance" };

    @computed get transformEditor() {
        return <div className="transform-editor">
            {this.controlPointsButton}
            {this.hgtInput}
            {this.XpsInput}
            {this.rotInput}
        </div>;
    };

    render() {

        if (!this.selectedDoc) {
            return <div className="propertiesView" style={{ width: this.props.width }}>
                <div className="propertiesView-title" style={{ width: this.props.width, paddingLeft: 6 }}>
                    No Document Selected
            </div> </div>;
        }

        const novice = Doc.UserDoc().noviceMode;

        return <div className="propertiesView" style={{ width: this.props.width }} >
            <div className="propertiesView-title" style={{ width: this.props.width }}>
                <div className="propertiesView-title-name">Properties </div>
                <div className="propertiesView-title-icon" onPointerDown={this.props.onDown}>
                    <FontAwesomeIcon icon="times" color="black" size="sm" />
                </div>
            </div>
            <div className="propertiesView-name">
                {this.editableTitle}
            </div>
            <div className="propertiesView-settings">
                <div className="propertiesView-settings-title"
                    onPointerDown={() => runInAction(() => { this.openActions = !this.openActions; })}
                    style={{ backgroundColor: this.openActions ? "black" : "" }}>
                    Actions
                    <div className="propertiesView-settings-title-icon">
                        <FontAwesomeIcon icon={this.openActions ? "caret-down" : "caret-right"} size="lg" color="white" />
                    </div>
                </div>
                {this.openActions ? <div className="propertiesView-settings-content">
                    <PropertiesButtons />
                </div> : null}
            </div>
            <div className="propertiesView-sharing">
                <div className="propertiesView-sharing-title"
                    onPointerDown={() => runInAction(() => { this.openSharing = !this.openSharing; })}
                    style={{ backgroundColor: this.openSharing ? "black" : "" }}>
                    Sharing {"&"} Permissions
                    <div className="propertiesView-sharing-title-icon">
                        <FontAwesomeIcon icon={this.openSharing ? "caret-down" : "caret-right"} size="lg" color="white" />
                    </div>
                </div>
                {this.openSharing ? <div className="propertiesView-sharing-content">
                    {this.sharingTable}
                </div> : null}
            </div>




            {this.isInk ? <div className="propertiesView-appearance">
                <div className="propertiesView-appearance-title"
                    onPointerDown={() => runInAction(() => { this.openAppearance = !this.openAppearance; })}
                    style={{ backgroundColor: this.openAppearance ? "black" : "" }}>
                    Appearance
                    <div className="propertiesView-appearance-title-icon">
                        <FontAwesomeIcon icon={this.openAppearance ? "caret-down" : "caret-right"} size="lg" color="white" />
                    </div>
                </div>
                {this.openAppearance ? <div className="propertiesView-appearance-content">
                    {this.appearanceEditor}
                </div> : null}
            </div> : null}

            {this.isInk ? <div className="propertiesView-transform">
                <div className="propertiesView-transform-title"
                    onPointerDown={() => runInAction(() => { this.openTransform = !this.openTransform; })}
                    style={{ backgroundColor: this.openTransform ? "black" : "" }}>
                    Transform
                    <div className="propertiesView-transform-title-icon">
                        <FontAwesomeIcon icon={this.openTransform ? "caret-down" : "caret-right"} size="lg" color="white" />
                    </div>
                </div>
                {this.openTransform ? <div className="propertiesView-transform-content">
                    {this.transformEditor}
                </div> : null}
            </div> : null}





            <div className="propertiesView-fields">
                <div className="propertiesView-fields-title"
                    onPointerDown={() => runInAction(() => { this.openFields = !this.openFields; })}
                    style={{ backgroundColor: this.openFields ? "black" : "" }}>
                    <div className="propertiesView-fields-title-name">
                        Fields {"&"} Tags
                        <div className="propertiesView-fields-title-icon">
                            <FontAwesomeIcon icon={this.openFields ? "caret-down" : "caret-right"} size="lg" color="white" />
                        </div>
                    </div>
                </div>
                {!novice && this.openFields ? <div className="propertiesView-fields-checkbox">
                    {this.fieldsCheckbox}
                    <div className="propertiesView-fields-checkbox-text">Layout</div>
                </div> : null}
                {this.openFields ?
                    <div className="propertiesView-fields-content">
                        {novice ? this.noviceFields : this.expandedField}
                    </div> : null}
            </div>
            <div className="propertiesView-layout">
                <div className="propertiesView-layout-title"
                    onPointerDown={() => runInAction(() => { this.openLayout = !this.openLayout; })}
                    style={{ backgroundColor: this.openLayout ? "black" : "" }}>
                    Layout
                    <div className="propertiesView-layout-title-icon"
                        onPointerDown={() => runInAction(() => { this.openLayout = !this.openLayout; })}>
                        <FontAwesomeIcon icon={this.openLayout ? "caret-down" : "caret-right"} size="lg" color="white" />
                    </div>
                </div>
                {this.openLayout ? <div className="propertiesView-layout-content">{this.layoutPreview}</div> : null}
            </div>
        </div>;
    }
} 