import React = require("react");
import { observer } from "mobx-react";
import "./PropertiesView.scss";
import { observable, action, computed, runInAction } from "mobx";
import { Doc, Field, DocListCast, WidthSym, HeightSym, AclSym, AclPrivate, AclReadonly, AclAddonly, AclEdit, AclAdmin } from "../../../../fields/Doc";
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
        return <Tooltip title={<><div className="dash-tooltip">{"Notify group of permissions change"}</div></>}>
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

    sharingItem(name: string, notify: boolean, effectiveAcl: symbol, permission?: string) {
        return <div className="propertiesView-sharingTable-item">
            <div className="propertiesView-sharingTable-item-name" style={{ width: notify ? "70px" : "80px" }}> {name} </div>
            {notify ? this.notifyIcon : null}
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
                if (name !== Doc.CurrentUserEmail && name !== this.selectedDoc!.author) tableEntries.push(this.sharingItem(name, false, effectiveAcl, AclMap.get(value)!));
            }
        }

        tableEntries.unshift(this.sharingItem("Me", false, effectiveAcl, Doc.CurrentUserEmail === this.selectedDoc!.author ? "Owner" : StrCast(this.selectedDoc![`ACL-${Doc.CurrentUserEmail.replace(".", "_")}`])));
        if (Doc.CurrentUserEmail !== this.selectedDoc!.author) tableEntries.unshift(this.sharingItem(StrCast(this.selectedDoc!.author), false, effectiveAcl, "Owner"));

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

    setTitle = (value: string) => {
        if (this.dataDoc) {
            this.selectedDoc && (this.selectedDoc.title = value);
            KeyValueBox.SetField(this.dataDoc, "title", value, true);
            return true;
        }
        return false;
    }

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
                <div className="propertiesView-settings-title" style={{ backgroundColor: this.openActions ? "black" : "" }}>
                    Actions
                    <div className="propertiesView-settings-title-icon"
                        onPointerDown={() => runInAction(() => { this.openActions = !this.openActions; })}>
                        <FontAwesomeIcon icon={this.openActions ? "caret-down" : "caret-right"} size="lg" color="white" />
                    </div>
                </div>
                {this.openActions ? <div className="propertiesView-settings-content">
                    <PropertiesButtons />
                </div> : null}
            </div>
            <div className="propertiesView-sharing">
                <div className="propertiesView-sharing-title" style={{ backgroundColor: this.openSharing ? "black" : "" }}>
                    Sharing {"&"} Permissions
                    <div className="propertiesView-sharing-title-icon"
                        onPointerDown={() => runInAction(() => { this.openSharing = !this.openSharing; })}>
                        <FontAwesomeIcon icon={this.openSharing ? "caret-down" : "caret-right"} size="lg" color="white" />
                    </div>
                </div>
                {this.openSharing ? <div className="propertiesView-sharing-content">
                    {this.sharingTable}
                </div> : null}
            </div>




            {this.isInk ? <div className="propertiesView-appearance">
                <div className="propertiesView-appearance-title" style={{ backgroundColor: this.openAppearance ? "black" : "" }}>
                    Appearance
                    <div className="propertiesView-appearance-title-icon"
                        onPointerDown={() => runInAction(() => { this.openAppearance = !this.openAppearance; })}>
                        <FontAwesomeIcon icon={this.openAppearance ? "caret-down" : "caret-right"} size="lg" color="white" />
                    </div>
                </div>
                {this.openAppearance ? <div className="propertiesView-appearance-content">
                    <FormatShapePane />
                </div> : null}
            </div> : null}

            {this.isInk ? <div className="propertiesView-transform">
                <div className="propertiesView-transform-title" style={{ backgroundColor: this.openTransform ? "black" : "" }}>
                    Transform
                    <div className="propertiesView-transform-title-icon"
                        onPointerDown={() => runInAction(() => { this.openTransform = !this.openTransform; })}>
                        <FontAwesomeIcon icon={this.openTransform ? "caret-down" : "caret-right"} size="lg" color="white" />
                    </div>
                </div>
                {this.openTransform ? <div className="propertiesView-transform-content">
                    transform
                </div> : null}
            </div> : null}





            <div className="propertiesView-fields">
                <div className="propertiesView-fields-title" style={{ backgroundColor: this.openFields ? "black" : "" }}>
                    <div className="propertiesView-fields-title-name">
                        Fields {"&"} Tags
                        <div className="propertiesView-fields-title-icon"
                            onPointerDown={() => runInAction(() => { this.openFields = !this.openFields; })}>
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
                <div className="propertiesView-layout-title" style={{ backgroundColor: this.openLayout ? "black" : "" }}>
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