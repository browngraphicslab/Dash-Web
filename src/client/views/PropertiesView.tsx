import React = require("react");
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Checkbox, Tooltip } from "@material-ui/core";
import { action, computed, observable } from "mobx";
import { observer } from "mobx-react";
import { ColorState, SketchPicker } from "react-color";
import { AclAddonly, AclAdmin, AclEdit, AclPrivate, AclReadonly, AclSym, AclUnset, DataSym, Doc, Field, HeightSym, WidthSym } from "../../fields/Doc";
import { Id } from "../../fields/FieldSymbols";
import { InkField } from "../../fields/InkField";
import { ComputedField } from "../../fields/ScriptField";
import { Cast, NumCast, StrCast } from "../../fields/Types";
import { GetEffectiveAcl, SharingPermissions } from "../../fields/util";
import { emptyFunction, emptyPath, returnEmptyDoclist, returnEmptyFilter, returnFalse, returnOne, returnZero } from "../../Utils";
import { DocumentType } from "../documents/DocumentTypes";
import { DocumentManager } from "../util/DocumentManager";
import { SelectionManager } from "../util/SelectionManager";
import { SharingManager } from "../util/SharingManager";
import { Transform } from "../util/Transform";
import { undoBatch, UndoManager } from "../util/UndoManager";
import { CollectionDockingView } from "./collections/CollectionDockingView";
import { EditableView } from "./EditableView";
import { InkStrokeProperties } from "./InkStrokeProperties";
import { ContentFittingDocumentView } from "./nodes/ContentFittingDocumentView";
import { KeyValueBox } from "./nodes/KeyValueBox";
import { PresBox } from "./nodes/PresBox";
import { PropertiesButtons } from "./PropertiesButtons";
import { PropertiesDocContextSelector } from "./PropertiesDocContextSelector";
import "./PropertiesView.scss";
import { intersection } from "lodash";
const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;
const _global = (window /* browser */ || global /* node */) as any;

interface PropertiesViewProps {
    width: number;
    height: number;
}

@observer
export class PropertiesView extends React.Component<PropertiesViewProps> {
    private _widthUndo?: UndoManager.Batch;

    @computed get MAX_EMBED_HEIGHT() { return 200; }

    @computed get selectedDoc() { return SelectionManager.SelectedSchemaDoc() || this.selectedDocumentView?.rootDoc; }
    @computed get selectedDocumentView() {
        if (SelectionManager.SelectedDocuments().length) return SelectionManager.SelectedDocuments()[0];
        if (PresBox.Instance && PresBox.Instance._selectedArray) return DocumentManager.Instance.getDocumentView(PresBox.Instance.rootDoc);
        return undefined;
    }
    @computed get isPres(): boolean {
        if (this.selectedDoc?.type === DocumentType.PRES) return true;
        return false;
    }
    @computed get dataDoc() { return this.selectedDoc?.[DataSym]; }

    @observable layoutFields: boolean = false;

    @observable openOptions: boolean = true;
    @observable openSharing: boolean = true;
    @observable openFields: boolean = true;
    @observable openLayout: boolean = true;
    @observable openContexts: boolean = true;
    @observable openAppearance: boolean = true;
    @observable openTransform: boolean = true;
    // @observable selectedUser: string = "";
    // @observable addButtonPressed: boolean = false;
    @observable layoutDocAcls: boolean = false;

    //Pres Trails booleans:
    @observable openPresTransitions: boolean = false;
    @observable openPresProgressivize: boolean = false;
    @observable openAddSlide: boolean = false;
    @observable openSlideOptions: boolean = false;

    @observable inOptions: boolean = false;
    @observable _controlBtn: boolean = false;
    @observable _lock: boolean = false;

    @computed get isInk() { return this.selectedDoc?.type === DocumentType.INK; }

    rtfWidth = () => {
        return !this.selectedDoc ? 0 : Math.min(this.selectedDoc?.[WidthSym](), this.props.width - 20);
    }
    rtfHeight = () => {
        return !this.selectedDoc ? 0 : this.rtfWidth() <= this.selectedDoc?.[WidthSym]() ? Math.min(this.selectedDoc?.[HeightSym](), this.MAX_EMBED_HEIGHT) : this.MAX_EMBED_HEIGHT;
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
            const docs = SelectionManager.SelectedDocuments().length < 2 ? [this.layoutFields ? Doc.Layout(this.selectedDoc) : this.dataDoc] :
                SelectionManager.SelectedDocuments().map(dv => this.layoutFields ? Doc.Layout(dv.layoutDoc) : dv.dataDoc);
            docs.forEach(doc => Object.keys(doc).forEach(key => !(key in ids) && doc[key] !== ComputedField.undefined && (ids[key] = key)));
            const rows: JSX.Element[] = [];
            for (const key of Object.keys(ids).slice().sort()) {
                const docvals = new Set<any>();
                docs.forEach(doc => docvals.add(doc[key]));
                const contents = Array.from(docvals.keys()).length > 1 ? "-multiple" : docs[0][key];
                if (key[0] === "#") {
                    rows.push(<div style={{ display: "flex", overflowY: "visible", marginBottom: "2px" }} key={key}>
                        <span style={{ fontWeight: "bold", whiteSpace: "nowrap" }}>{key}</span>
                    &nbsp;
                </div>);
                } else {
                    const contentElement = <EditableView key="editableView"
                        contents={contents !== undefined ? Field.toString(contents as Field) : "null"}
                        height={13}
                        fontSize={10}
                        GetValue={() => contents !== undefined ? Field.toString(contents as Field) : "null"}
                        SetValue={(value: string) => { docs.map(doc => KeyValueBox.SetField(doc, key, value, true)); return true; }}
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
        if (this.dataDoc) {
            const ids: { [key: string]: string } = {};
            const docs = SelectionManager.SelectedDocuments().length < 2 ? [this.dataDoc] : SelectionManager.SelectedDocuments().map(dv => dv.dataDoc);
            docs.forEach(doc => Object.keys(doc).forEach(key => !(key in ids) && doc[key] !== ComputedField.undefined && (ids[key] = key)));
            const rows: JSX.Element[] = [];
            const noviceReqFields = ["author", "creationDate", "tags"];
            const noviceLayoutFields = ["_curPage"];
            const noviceKeys = [...Array.from(Object.keys(ids)).filter(key => key[0] === "#" || key.indexOf("lastModified") !== -1 || (key[0] === key[0].toUpperCase() && !key.startsWith("acl"))),
            ...noviceReqFields, ...noviceLayoutFields];
            for (const key of noviceKeys.sort()) {
                const docvals = new Set<any>();
                docs.forEach(doc => docvals.add(doc[key]));
                const contents = Array.from(docvals.keys()).length > 1 ? "-multiple" : docs[0][key];
                if (key[0] === "#") {
                    rows.push(<div className="uneditable-field" key={key}>
                        <span style={{ fontWeight: "bold", whiteSpace: "nowrap" }}>{key}</span>
                        &nbsp;
                    </div>);
                } else if (contents !== undefined) {
                    const value = Field.toString(contents as Field);
                    if (noviceReqFields.includes(key) || key.indexOf("lastModified") !== -1) {
                        rows.push(<div className="uneditable-field" key={key}>
                            <span style={{ fontWeight: "bold", whiteSpace: "nowrap" }}>{key + ": "}</span>
                            <div style={{ whiteSpace: "nowrap", overflowX: "hidden" }}>{value}</div>
                        </div>);
                    } else {
                        const contentElement = <EditableView key="editableView"
                            contents={value}
                            height={13}
                            fontSize={10}
                            GetValue={() => contents !== undefined ? Field.toString(contents as Field) : "null"}
                            SetValue={(value: string) => { docs.map(doc => KeyValueBox.SetField(doc, key, value, true)); return true; }}
                        />;

                        rows.push(<div style={{ display: "flex", overflowY: "visible", marginBottom: "-1px" }} key={key}>
                            <span style={{ fontWeight: "bold", whiteSpace: "nowrap" }}>{key + ":"}</span>
                        &nbsp;
                        {contentElement}
                        </div>);
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

    @undoBatch
    setKeyValue = (value: string) => {
        const docs = SelectionManager.SelectedDocuments().length < 2 && this.selectedDoc ? [this.layoutFields ? Doc.Layout(this.selectedDoc) : this.dataDoc] : SelectionManager.SelectedDocuments().map(dv => this.layoutFields ? dv.layoutDoc : dv.dataDoc);
        docs.forEach(doc => {
            if (value.indexOf(":") !== -1) {
                const newVal = value[0].toUpperCase() + value.substring(1, value.length);
                const splits = newVal.split(":");
                KeyValueBox.SetField(doc, splits[0], splits[1], true);
                const tags = StrCast(doc.tags, ":");
                if (tags.includes(`${splits[0]}:`) && splits[1] === "undefined") {
                    KeyValueBox.SetField(doc, "tags", `"${tags.replace(splits[0] + ":", "")}"`, true);
                }
                return true;
            } else if (value[0] === "#") {
                const newVal = value + `:'${value}'`;
                doc[DataSym][value] = value;
                const tags = StrCast(doc.tags, ":");
                if (!tags.includes(`${value}:`)) {
                    doc[DataSym].tags = `${tags + value + ':'}`;
                }
                return true;
            }
        });
        return false;
    }

    @observable transform: Transform = Transform.Identity();
    getTransform = () => this.transform;
    propertiesDocViewRef = (ref: HTMLDivElement) => {
        const observer = new _global.ResizeObserver(action((entries: any) => {
            const cliRect = ref.getBoundingClientRect();
            this.transform = new Transform(-cliRect.x, -cliRect.y, 1);
        }));
        ref && observer.observe(ref);
    }

    @computed get contexts() {
        return !this.selectedDoc ? (null) : <PropertiesDocContextSelector Document={this.selectedDoc} hideTitle={true} addDocTab={(doc, where) => CollectionDockingView.AddSplit(doc, "right")} />;
    }

    previewBackground = () => "lightgrey";
    @computed get layoutPreview() {
        if (SelectionManager.SelectedDocuments().length > 1) {
            return "-- multiple selected --";
        }
        if (this.selectedDoc) {
            const layoutDoc = Doc.Layout(this.selectedDoc);
            const panelHeight = StrCast(Doc.LayoutField(layoutDoc)).includes("FormattedTextBox") ? this.rtfHeight : this.docHeight;
            const panelWidth = StrCast(Doc.LayoutField(layoutDoc)).includes("FormattedTextBox") ? this.rtfWidth : this.docWidth;
            return <div ref={this.propertiesDocViewRef} style={{ pointerEvents: "none", display: "inline-block", height: panelHeight() }} key={this.selectedDoc[Id]}>
                <ContentFittingDocumentView
                    Document={layoutDoc}
                    DataDoc={this.dataDoc}
                    LibraryPath={emptyPath}
                    renderDepth={1}
                    rootSelected={returnFalse}
                    treeViewDoc={undefined}
                    backgroundColor={this.previewBackground}
                    fitToBox={true}
                    FreezeDimensions={true}
                    dontCenter={true}
                    NativeWidth={layoutDoc.type === DocumentType.RTF ? this.rtfWidth : undefined}
                    NativeHeight={layoutDoc.type === DocumentType.RTF ? this.rtfHeight : undefined}
                    PanelWidth={panelWidth}
                    PanelHeight={panelHeight}
                    focus={returnFalse}
                    ScreenToLocalTransform={this.getTransform}
                    docFilters={returnEmptyFilter}
                    searchFilterDocs={returnEmptyDoclist}
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
                    dontRegisterView={true}
                    dropAction={undefined}
                />
            </div>;
        } else {
            return null;
        }
    }

    /**
     * Handles the changing of a user's permissions from the permissions panel.
     */
    @undoBatch
    changePermissions = (e: any, user: string) => {
        const docs = SelectionManager.SelectedDocuments().length < 2 ? [this.selectedDoc!] : SelectionManager.SelectedDocuments().map(docView => docView.props.Document);
        SharingManager.Instance.shareFromPropertiesSidebar(user, e.currentTarget.value as SharingPermissions, docs);
    }

    /**
     * @returns the options for the permissions dropdown.
     */
    getPermissionsSelect(user: string, permission: string) {
        const dropdownValues: string[] = Object.values(SharingPermissions);
        if (permission === "-multiple-") dropdownValues.unshift(permission);
        return <select className="permissions-select"
            value={permission}
            onChange={e => this.changePermissions(e, user)}>
            {dropdownValues.map(permission => {
                return (
                    <option key={permission} value={permission}>
                        {permission}
                    </option>);
            })}
        </select>;
    }

    /**
     * @returns the notification icon. On clicking, it should notify someone of a document been shared with them.
     */
    @computed get notifyIcon() {
        return <Tooltip title={<div className="dash-tooltip">Notify with message</div>}>
            <div className="notify-button">
                <FontAwesomeIcon className="notify-button-icon" icon="bell" color="white" size="sm" />
            </div>
        </Tooltip>;
    }

    /**
     * ... next to the owner that opens the main SharingManager interface on click.
     */
    @computed get expansionIcon() {
        return <Tooltip title={<div className="dash-tooltip">{"Show more permissions"}</div>}>
            <div className="expansion-button" onPointerDown={() => {
                if (this.selectedDocumentView || this.selectedDoc) {
                    SharingManager.Instance.open(this.selectedDocumentView?.props.Document === this.selectedDocumentView ? this.selectedDocumentView : undefined, this.selectedDoc);
                }
            }}>
                <FontAwesomeIcon className="expansion-button-icon" icon="ellipsis-h" color="black" size="sm" />
            </div>
        </Tooltip>;
    }

    /**
     * @returns a row of the permissions panel
     */
    sharingItem(name: string, admin: boolean, permission: string, showExpansionIcon?: boolean) {
        return <div className="propertiesView-sharingTable-item" key={name + permission}
        // style={{ backgroundColor: this.selectedUser === name ? "#bcecfc" : "" }}
        // onPointerDown={action(() => this.selectedUser = this.selectedUser === name ? "" : name)}
        >
            <div className="propertiesView-sharingTable-item-name" style={{ width: name !== "Me" ? "85px" : "80px" }}> {name} </div>
            {/* {name !== "Me" ? this.notifyIcon : null} */}
            <div className="propertiesView-sharingTable-item-permission">
                {admin && permission !== "Owner" ? this.getPermissionsSelect(name, permission) : permission}
                {permission === "Owner" || showExpansionIcon ? this.expansionIcon : null}
            </div>
        </div>;
    }

    /**
     * @returns the sharing and permissions panel.
     */
    @computed get sharingTable() {
        const AclMap = new Map<symbol, string>([
            [AclUnset, "unset"],
            [AclPrivate, SharingPermissions.None],
            [AclReadonly, SharingPermissions.View],
            [AclAddonly, SharingPermissions.Add],
            [AclEdit, SharingPermissions.Edit],
            [AclAdmin, SharingPermissions.Admin]
        ]);

        // all selected docs
        const docs = SelectionManager.SelectedDocuments().length < 2 ?
            [this.layoutDocAcls ? this.selectedDoc! : this.selectedDoc![DataSym]]
            : SelectionManager.SelectedDocuments().map(docView => this.layoutDocAcls ? docView.props.Document : docView.props.Document[DataSym]);

        const target = docs[0];

        // tslint:disable-next-line: no-unnecessary-callback-wrapper
        const effectiveAcls = docs.map(doc => GetEffectiveAcl(doc));
        const showAdmin = effectiveAcls.every(acl => acl === AclAdmin);

        // users in common between all docs
        const commonKeys = intersection(...docs.map(doc => this.layoutDocAcls ? doc?.[AclSym] && Object.keys(doc[AclSym]) : doc?.[DataSym][AclSym] && Object.keys(doc[DataSym][AclSym])));

        const tableEntries = [];

        // DocCastAsync(Doc.UserDoc().sidebarUsersDisplayed).then(sidebarUsersDisplayed => {
        if (commonKeys.length) {
            for (const key of commonKeys) {
                const name = key.substring(4).replace("_", ".");
                const uniform = docs.every(doc => this.layoutDocAcls ? doc?.[AclSym]?.[key] === docs[0]?.[AclSym]?.[key] : doc?.[DataSym]?.[AclSym]?.[key] === docs[0]?.[DataSym]?.[AclSym]?.[key]);
                if (name !== Doc.CurrentUserEmail && name !== target.author && name !== "Public" && name !== "Override"/* && sidebarUsersDisplayed![name] !== false*/) {
                    tableEntries.push(this.sharingItem(name, showAdmin, uniform ? AclMap.get(this.layoutDocAcls ? target[AclSym][key] : target[DataSym][AclSym][key])! : "-multiple-"));
                }
            }
        }

        //     if (Doc.UserDoc().sidebarUsersDisplayed) {
        //         for (const [name, value] of Object.entries(sidebarUsersDisplayed!)) {
        //             if (value === true && !this.selectedDoc![`acl-${name.substring(8).replace(".", "_")}`]) tableEntries.push(this.sharingItem(name.substring(8), effectiveAcl, SharingPermissions.None));
        //         }
        //     }
        // })

        const ownerSame = Doc.CurrentUserEmail !== target.author && docs.filter(doc => doc).every(doc => doc.author === docs[0].author);
        // shifts the current user, owner, public to the top of the doc.
        tableEntries.unshift(this.sharingItem("Override", showAdmin, docs.filter(doc => doc).every(doc => doc["acl-Override"] === docs[0]["acl-Override"]) ? (AclMap.get(target[AclSym]?.["acl-Override"]) || "unset") : "-multiple-"));
        tableEntries.unshift(this.sharingItem("Public", showAdmin, docs.filter(doc => doc).every(doc => doc["acl-Public"] === docs[0]["acl-Public"]) ? (AclMap.get(target[AclSym]?.["acl-Public"]) || SharingPermissions.None) : "-multiple-"));
        tableEntries.unshift(this.sharingItem("Me", showAdmin, docs.filter(doc => doc).every(doc => doc.author === Doc.CurrentUserEmail) ? "Owner" : effectiveAcls.every(acl => acl === effectiveAcls[0]) ? AclMap.get(effectiveAcls[0])! : "-multiple-", !ownerSame));
        if (ownerSame) tableEntries.unshift(this.sharingItem(StrCast(target.author), showAdmin, "Owner"));

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
        const titles = new Set<string>();
        SelectionManager.SelectedDocuments().forEach(dv => titles.add(StrCast(dv.rootDoc.title)));
        const title = Array.from(titles.keys()).length > 1 ? "--multiple selected--" : StrCast(this.selectedDoc?.title);
        return <div className="editable-title"><EditableView
            key="editableView"
            contents={title}
            height={25}
            fontSize={14}
            GetValue={() => title}
            SetValue={this.setTitle} /> </div>;
    }

    @undoBatch
    @action
    setTitle = (value: string) => {
        if (SelectionManager.SelectedDocuments().length > 1) {
            SelectionManager.SelectedDocuments().map(dv => Doc.SetInPlace(dv.rootDoc, "title", value, true));
            return true;
        } else if (this.dataDoc) {
            if (this.selectedDoc) Doc.SetInPlace(this.selectedDoc, "title", value, true);
            else KeyValueBox.SetField(this.dataDoc, "title", value, true);
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
                const inks = Cast(doc.data, InkField)?.inkData;
                if (inks) {
                    const newPoints: { X: number, Y: number }[] = [];
                    inks.forEach(ink => {
                        const newX = Math.cos(angle) * (ink.X - _centerPoints[index].X) - Math.sin(angle) * (ink.Y - _centerPoints[index].Y) + _centerPoints[index].X;
                        const newY = Math.sin(angle) * (ink.X - _centerPoints[index].X) + Math.cos(angle) * (ink.Y - _centerPoints[index].Y) + _centerPoints[index].Y;
                        newPoints.push({ X: newX, Y: newY });
                    });
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



    @computed
    get controlPointsButton() {
        const formatInstance = InkStrokeProperties.Instance;
        return !formatInstance ? (null) : <div className="inking-button">
            <Tooltip title={<div className="dash-tooltip">{"Edit points"}</div>}>
                <div className="inking-button-points" onPointerDown={action(() => formatInstance._controlBtn = !formatInstance._controlBtn)} style={{ backgroundColor: formatInstance._controlBtn ? "black" : "" }}>
                    <FontAwesomeIcon icon="bezier-curve" color="white" size="lg" />
                </div>
            </Tooltip>
            <Tooltip title={<div className="dash-tooltip">{formatInstance._lock ? "Unlock ratio" : "Lock ratio"}</div>}>
                <div className="inking-button-lock" onPointerDown={action(() => formatInstance._lock = !formatInstance._lock)} >
                    <FontAwesomeIcon icon={formatInstance._lock ? "lock" : "unlock"} color="white" size="lg" />
                </div>
            </Tooltip>
            <Tooltip title={<div className="dash-tooltip">{"Rotate 90˚"}</div>}>
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
                onChange={e => {
                    setter(e.target.value);
                }}
                onKeyPress={e => {
                    e.stopPropagation();
                }} />
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
                InkStrokeProperties.Instance?._lock && this.selectedDoc && (this.selectedDoc._height = (NumCast(this.selectedDoc?._width) / oldWidth * NumCast(this.selectedDoc?._height)));
                const doc = this.selectedDoc;
                if (doc?.type === DocumentType.INK && doc.x && doc.y && doc._height && doc._width) {
                    const ink = Cast(doc.data, InkField)?.inkData;
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
                InkStrokeProperties.Instance?._lock && this.selectedDoc && (this.selectedDoc._width = (NumCast(this.selectedDoc?._height) / oHeight * NumCast(this.selectedDoc?._width)));
                const docu = this.selectedDoc;
                if (docu?.type === DocumentType.INK && docu.x && docu.y && docu._height && docu._width) {
                    const ink = Cast(docu.data, InkField)?.inkData;
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
        return Field.toString(this.selectedDoc?.[key] as Field);
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
        InkStrokeProperties.Instance?._lock && this.selectedDoc && (this.selectedDoc._height = (NumCast(this.selectedDoc?._width) * NumCast(this.selectedDoc?._height)) / oldWidth);
    }
    set shapeHgt(value) {
        const oldHeight = NumCast(this.selectedDoc?._height);
        this.selectedDoc && (this.selectedDoc._height = Number(value));
        InkStrokeProperties.Instance?._lock && this.selectedDoc && (this.selectedDoc._width = (NumCast(this.selectedDoc?._height) * NumCast(this.selectedDoc?._width)) / oldHeight);
    }

    @computed get hgtInput() { return this.inputBoxDuo("hgt", this.shapeHgt, (val: string) => { if (!isNaN(Number(val))) { this.shapeHgt = val; } return true; }, "H:", "wid", this.shapeWid, (val: string) => { if (!isNaN(Number(val))) { this.shapeWid = val; } return true; }, "W:"); }
    @computed get XpsInput() { return this.inputBoxDuo("Xps", this.shapeXps, (val: string) => { if (val !== "0" && !isNaN(Number(val))) { this.shapeXps = val; } return true; }, "X:", "Yps", this.shapeYps, (val: string) => { if (val !== "0" && !isNaN(Number(val))) { this.shapeYps = val; } return true; }, "Y:"); }
    @computed get rotInput() { return this.inputBoxDuo("rot", this.shapeRot, (val: string) => { if (!isNaN(Number(val))) { this.rotate(Number(val) - Number(this.shapeRot)); this.shapeRot = val; } return true; }, "∠:", "rot", this.shapeRot, (val: string) => { if (!isNaN(Number(val))) { this.rotate(Number(val) - Number(this.shapeRot)); this.shapeRot = val; } return true; }, ""); }


    @observable private _fillBtn = false;
    @observable private _lineBtn = false;

    private _lastFill = "#D0021B";
    private _lastLine = "#D0021B";
    private _lastDash: any = "2";

    @computed get colorFil() { const ccol = this.getField("fillColor") || ""; ccol && (this._lastFill = ccol); return ccol; }
    @computed get colorStk() { const ccol = this.getField("color") || ""; ccol && (this._lastLine = ccol); return ccol; }
    set colorFil(value) { value && (this._lastFill = value); this.selectedDoc && (this.selectedDoc.fillColor = value ? value : undefined); }
    set colorStk(value) { value && (this._lastLine = value); this.selectedDoc && (this.selectedDoc.color = value ? value : undefined); }

    colorButton(value: string, type: string, setter: () => {}) {
        // return <div className="properties-flyout" onPointerEnter={e => this.changeScrolling(false)}
        //     onPointerLeave={e => this.changeScrolling(true)}>
        //     <Flyout anchorPoint={anchorPoints.LEFT_TOP}
        //         content={type === "fill" ? this.fillPicker : this.linePicker}>
        return <div className="color-button" key="color" onPointerDown={undoBatch(action(e => setter()))}>
            <div className="color-button-preview" style={{
                backgroundColor: value ?? "121212", width: 15, height: 15,
                display: value === "" || value === "transparent" ? "none" : ""
            }} />
            {value === "" || value === "transparent" ? <p style={{ fontSize: 25, color: "red", marginTop: -14 }}>☒</p> : ""}
        </div>;
        //     </Flyout>
        // </div>;

    }

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

    colorPicker(setter: (color: string) => {}, type: string) {
        return <SketchPicker onChange={type === "stk" ? this.switchStk : this.switchFil}
            presetColors={['#D0021B', '#F5A623', '#F8E71C', '#8B572A', '#7ED321', '#417505',
                '#9013FE', '#4A90E2', '#50E3C2', '#B8E986', '#000000', '#4A4A4A', '#9B9B9B',
                '#FFFFFF', '#f1efeb', 'transparent']}
            color={type === "stk" ? this.colorStk : this.colorFil} />;
    }

    @computed get fillButton() { return this.colorButton(this.colorFil, "fill", () => { this._fillBtn = !this._fillBtn; this._lineBtn = false; return true; }); }
    @computed get lineButton() { return this.colorButton(this.colorStk, "line", () => { this._lineBtn = !this._lineBtn; this._fillBtn = false; return true; }); }

    @computed get fillPicker() { return this.colorPicker((color: string) => this.colorFil = color, "fil"); }
    @computed get linePicker() { return this.colorPicker((color: string) => this.colorStk = color, "stk"); }

    @computed get strokeAndFill() {
        return <div>
            <div key="fill" className="strokeAndFill">
                <div className="fill">
                    <div className="fill-title">Fill:</div>
                    <div className="fill-button">{this.fillButton}</div>
                </div>
                <div className="stroke">
                    <div className="stroke-title"> Stroke: </div>
                    <div className="stroke-button">{this.lineButton}</div>
                </div>
            </div>
            {this._fillBtn ? this.fillPicker : ""}
            {this._lineBtn ? this.linePicker : ""}
        </div>;
    }

    @computed get solidStk() { return this.selectedDoc?.color && (!this.selectedDoc?.strokeDash || this.selectedDoc?.strokeDash === "0") ? true : false; }
    @computed get dashdStk() { return this.selectedDoc?.strokeDash || ""; }
    @computed get unStrokd() { return this.selectedDoc?.color ? true : false; }
    @computed get widthStk() { return this.getField("strokeWidth") || "1"; }
    @computed get markHead() { return this.getField("strokeStartMarker") || ""; }
    @computed get markTail() { return this.getField("strokeEndMarker") || ""; }
    set solidStk(value) { this.dashdStk = ""; this.unStrokd = !value; }
    set dashdStk(value) {
        value && (this._lastDash = value) && (this.unStrokd = false);
        this.selectedDoc && (this.selectedDoc.strokeDash = value ? this._lastDash : undefined);
    }
    set widthStk(value) { this.selectedDoc && (this.selectedDoc.strokeWidth = Number(value)); }
    set unStrokd(value) { this.colorStk = value ? "" : this._lastLine; }
    set markHead(value) { this.selectedDoc && (this.selectedDoc.strokeStartMarker = value); }
    set markTail(value) { this.selectedDoc && (this.selectedDoc.strokeEndMarker = value); }


    @computed get stkInput() { return this.regInput("stk", this.widthStk, (val: string) => this.widthStk = val); }


    regInput = (key: string, value: any, setter: (val: string) => {}) => {
        return <div className="inputBox">
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

    @computed get widthAndDash() {
        return <div className="widthAndDash">
            <div className="width">
                <div className="width-top">
                    <div className="width-title">Width:</div>
                    <div className="width-input">{this.stkInput}</div>
                </div>
                <input className="width-range" type="range"
                    defaultValue={Number(this.widthStk)} min={1} max={100}
                    onChange={(action((e) => this.widthStk = e.target.value))}
                    onMouseDown={(e) => { this._widthUndo = UndoManager.StartBatch("width undo"); }}
                    onMouseUp={(e) => { this._widthUndo?.end(); this._widthUndo = undefined; }}
                />
            </div>

            <div className="arrows">
                <div className="arrows-head">
                    <div className="arrows-head-title" >Arrow Head: </div>
                    <input key="markHead" className="arrows-head-input" type="checkbox"
                        checked={this.markHead !== ""}
                        onChange={undoBatch(action(() => this.markHead = this.markHead ? "" : "arrow"))} />
                </div>
                <div className="arrows-tail">
                    <div className="arrows-tail-title" >Arrow End: </div>
                    <input key="markTail" className="arrows-tail-input" type="checkbox"
                        checked={this.markTail !== ""}
                        onChange={undoBatch(action(() => this.markTail = this.markTail ? "" : "arrow"))} />
                </div>
            </div>
            <div className="dashed">
                <div className="dashed-title">Dashed Line:</div>
                <input key="markHead" className="dashed-input"
                    type="checkbox" checked={this.dashdStk === "2"}
                    onChange={this.changeDash} />
            </div>
        </div>;
    }

    @undoBatch @action
    changeDash = () => {
        this.dashdStk = this.dashdStk === "2" ? "0" : "2";
    }

    @computed get appearanceEditor() {
        return <div className="appearance-editor">
            {this.widthAndDash}
            {this.strokeAndFill}
        </div>;
    }

    @computed get transformEditor() {
        return <div className="transform-editor">
            {this.controlPointsButton}
            {this.hgtInput}
            {this.XpsInput}
            {this.rotInput}
        </div>;
    }

    /**
     * Handles adding and removing members from the sharing panel
     */
    // handleUserChange = (selectedUser: string, add: boolean) => {
    //     if (!Doc.UserDoc().sidebarUsersDisplayed) Doc.UserDoc().sidebarUsersDisplayed = new Doc;
    //     DocCastAsync(Doc.UserDoc().sidebarUsersDisplayed).then(sidebarUsersDisplayed => {
    //         sidebarUsersDisplayed![`display-${selectedUser}`] = add;
    //         !add && runInAction(() => this.selectedUser = "");
    //     });
    // }

    render() {
        if (!this.selectedDoc && !this.isPres) {
            return <div className="propertiesView" style={{ width: this.props.width }}>
                <div className="propertiesView-title" style={{ width: this.props.width }}>
                    No Document Selected
                </div>
            </div>;

        } else {
            const novice = Doc.UserDoc().noviceMode;

            if (this.selectedDoc && !this.isPres) {
                return <div className="propertiesView" style={{
                    width: this.props.width,
                    minWidth: this.props.width
                    //overflowY: this.scrolling ? "scroll" : "visible"
                }} >
                    <div className="propertiesView-title" style={{ width: this.props.width }}>
                        Properties
                    </div>
                    <div className="propertiesView-name">
                        {this.editableTitle}
                    </div>
                    <div className="propertiesView-settings" onPointerEnter={action(() => this.inOptions = true)}
                        onPointerLeave={action(() => this.inOptions = false)}>
                        <div className="propertiesView-settings-title"
                            onPointerDown={action(() => this.openOptions = !this.openOptions)}
                            style={{ backgroundColor: this.openOptions ? "black" : "" }}>
                            Options
                        <div className="propertiesView-settings-title-icon">
                                <FontAwesomeIcon icon={this.openOptions ? "caret-down" : "caret-right"} size="lg" color="white" />
                            </div>
                        </div>
                        {!this.openOptions ? (null) :
                            <div className="propertiesView-settings-content">
                                <PropertiesButtons />
                            </div>}
                    </div>
                    <div className="propertiesView-sharing">
                        <div className="propertiesView-sharing-title"
                            onPointerDown={action(() => this.openSharing = !this.openSharing)}
                            style={{ backgroundColor: this.openSharing ? "black" : "" }}>
                            Sharing {"&"} Permissions
                        <div className="propertiesView-sharing-title-icon">
                                <FontAwesomeIcon icon={this.openSharing ? "caret-down" : "caret-right"} size="lg" color="white" />
                            </div>
                        </div>
                        {!this.openSharing ? (null) :
                            <div className="propertiesView-sharing-content">
                                {!novice ? (<div className="propertiesView-acls-checkbox">
                                    <Checkbox
                                        color="primary"
                                        onChange={action(() => this.layoutDocAcls = !this.layoutDocAcls)}
                                        checked={this.layoutDocAcls}
                                    />;
                                    <div className="propertiesView-acls-checkbox-text">Layout</div>
                                </div>) : (null)}
                                {this.sharingTable}
                            </div>}
                    </div>

                    {!this.isInk ? (null) :
                        <div className="propertiesView-appearance">
                            <div className="propertiesView-appearance-title"
                                onPointerDown={action(() => this.openAppearance = !this.openAppearance)}
                                style={{ backgroundColor: this.openAppearance ? "black" : "" }}>
                                Appearance
                            <div className="propertiesView-appearance-title-icon">
                                    <FontAwesomeIcon icon={this.openAppearance ? "caret-down" : "caret-right"} size="lg" color="white" />
                                </div>
                            </div>
                            {!this.openAppearance ? (null) :
                                <div className="propertiesView-appearance-content">
                                    {this.appearanceEditor}
                                </div>}
                        </div>}

                    {this.isInk ? <div className="propertiesView-transform">
                        <div className="propertiesView-transform-title"
                            onPointerDown={action(() => this.openTransform = !this.openTransform)}
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
                            onPointerDown={action(() => this.openFields = !this.openFields)}
                            style={{ backgroundColor: this.openFields ? "black" : "" }}>
                            Fields {"&"} Tags
                            <div className="propertiesView-fields-title-icon">
                                <FontAwesomeIcon icon={this.openFields ? "caret-down" : "caret-right"} size="lg" color="white" />
                            </div>
                        </div>
                        {!novice && this.openFields ? <div className="propertiesView-fields-checkbox">
                            {this.fieldsCheckbox}
                            <div className="propertiesView-fields-checkbox-text">Layout</div>
                        </div> : null}
                        {!this.openFields ? (null) :
                            <div className="propertiesView-fields-content">
                                {novice ? this.noviceFields : this.expandedField}
                            </div>}
                    </div>
                    <div className="propertiesView-contexts">
                        <div className="propertiesView-contexts-title"
                            onPointerDown={action(() => this.openContexts = !this.openContexts)}
                            style={{ backgroundColor: this.openContexts ? "black" : "" }}>
                            Contexts
                        <div className="propertiesView-contexts-title-icon">
                                <FontAwesomeIcon icon={this.openContexts ? "caret-down" : "caret-right"} size="lg" color="white" />
                            </div>
                        </div>
                        {this.openContexts ? <div className="propertiesView-contexts-content"  >{this.contexts}</div> : null}
                    </div>
                    <div className="propertiesView-layout">
                        <div className="propertiesView-layout-title"
                            onPointerDown={action(() => this.openLayout = !this.openLayout)}
                            style={{ backgroundColor: this.openLayout ? "black" : "" }}>
                            Layout
                        <div className="propertiesView-layout-title-icon">
                                <FontAwesomeIcon icon={this.openLayout ? "caret-down" : "caret-right"} size="lg" color="white" />
                            </div>
                        </div>
                        {this.openLayout ? <div className="propertiesView-layout-content"  >{this.layoutPreview}</div> : null}
                    </div>
                </div>;
            }
            if (this.isPres) {
                const selectedItem: boolean = PresBox.Instance?._selectedArray.length > 0;
                const type = PresBox.Instance.activeItem?.type;
                return <div className="propertiesView" style={{ width: this.props.width }}>
                    <div className="propertiesView-title" style={{ width: this.props.width }}>
                        Presentation
                    </div>
                    <div className="propertiesView-name">
                        {this.editableTitle}
                        <div className="propertiesView-presSelected">
                            {PresBox.Instance?._selectedArray.length} selected
                            <div className="propertiesView-selectedList">
                                {PresBox.Instance?.listOfSelected}
                            </div>
                        </div>
                    </div>
                    {!selectedItem ? (null) : <div className="propertiesView-presTrails">
                        <div className="propertiesView-presTrails-title"
                            onPointerDown={action(() => { this.openPresTransitions = !this.openPresTransitions; })}
                            style={{ backgroundColor: this.openPresTransitions ? "black" : "" }}>
                            &nbsp; <FontAwesomeIcon icon={"rocket"} /> &nbsp; Transitions
                        <div className="propertiesView-presTrails-title-icon">
                                <FontAwesomeIcon icon={this.openPresTransitions ? "caret-down" : "caret-right"} size="lg" color="white" />
                            </div>
                        </div>
                        {this.openPresTransitions ? <div className="propertiesView-presTrails-content">
                            {PresBox.Instance.transitionDropdown}
                        </div> : null}
                    </div>}
                    {!selectedItem || type === DocumentType.VID || type === DocumentType.AUDIO ? (null) : <div className="propertiesView-presTrails">
                        <div className="propertiesView-presTrails-title"
                            onPointerDown={action(() => this.openPresProgressivize = !this.openPresProgressivize)}
                            style={{ backgroundColor: this.openPresProgressivize ? "black" : "" }}>
                            &nbsp; <FontAwesomeIcon icon={"tasks"} /> &nbsp; Progressivize
                        <div className="propertiesView-presTrails-title-icon">
                                <FontAwesomeIcon icon={this.openPresProgressivize ? "caret-down" : "caret-right"} size="lg" color="white" />
                            </div>
                        </div>
                        {this.openPresProgressivize ? <div className="propertiesView-presTrails-content">
                            {PresBox.Instance.progressivizeDropdown}
                        </div> : null}
                    </div>}
                    {!selectedItem || (type !== DocumentType.COL && type !== DocumentType.VID && type !== DocumentType.AUDIO) ? (null) : <div className="propertiesView-presTrails">
                        <div className="propertiesView-presTrails-title"
                            onPointerDown={action(() => { this.openSlideOptions = !this.openSlideOptions; })}
                            style={{ backgroundColor: this.openSlideOptions ? "black" : "" }}>
                            &nbsp; <FontAwesomeIcon icon={"cog"} /> &nbsp; {PresBox.Instance.stringType} options
                        <div className="propertiesView-presTrails-title-icon">
                                <FontAwesomeIcon icon={this.openSlideOptions ? "caret-down" : "caret-right"} size="lg" color="white" />
                            </div>
                        </div>
                        {this.openSlideOptions ? <div className="propertiesView-presTrails-content">
                            {PresBox.Instance.optionsDropdown}
                        </div> : null}
                    </div>}
                    <div className="propertiesView-presTrails">
                        <div className="propertiesView-presTrails-title"
                            onPointerDown={action(() => { this.openAddSlide = !this.openAddSlide; })}
                            style={{ backgroundColor: this.openAddSlide ? "black" : "" }}>
                            &nbsp; <FontAwesomeIcon icon={"plus"} /> &nbsp; Add new slide
                        <div className="propertiesView-presTrails-title-icon">
                                <FontAwesomeIcon icon={this.openAddSlide ? "caret-down" : "caret-right"} size="lg" color="white" />
                            </div>
                        </div>
                        {this.openAddSlide ? <div className="propertiesView-presTrails-content">
                            {PresBox.Instance.newDocumentDropdown}
                        </div> : null}
                    </div>
                </div>;
            }
        }
    }
}