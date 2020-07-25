import React = require("react");
import { observer } from "mobx-react";
import "./PropertiesView.scss";
import { observable, action, computed } from "mobx";
import { Doc, Field, DocListCast, WidthSym, HeightSym } from "../../../../fields/Doc";
import { DocumentView } from "../../nodes/DocumentView";
import { ComputedField } from "../../../../fields/ScriptField";
import { EditableView } from "../../EditableView";
import { KeyValueBox } from "../../nodes/KeyValueBox";
import { Cast, StrCast, NumCast } from "../../../../fields/Types";
import { listSpec } from "../../../../fields/Schema";
import { ContentFittingDocumentView } from "../../nodes/ContentFittingDocumentView";
import { returnFalse, returnOne, emptyFunction, emptyPath, returnTrue, returnZero, returnEmptyFilter, Utils } from "../../../../Utils";
import { Id } from "../../../../fields/FieldSymbols";
import { Transform } from "../../../util/Transform";
import { PropertiesButtons } from "../../PropertiesButtons";
import { SelectionManager } from "../../../util/SelectionManager";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "@material-ui/core";
import SharingManager from "../../../util/SharingManager";


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
        if (this.dataDoc) {
            const ids: { [key: string]: string } = {};
            const doc = this.dataDoc;
            doc && Object.keys(doc).forEach(key => !(key in ids) && doc[key] !== ComputedField.undefined && (ids[key] = key));

            const rows: JSX.Element[] = [];
            for (const key of Object.keys(ids).slice().sort()) {
                const contents = doc[key];
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
            return rows;
        }
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

    @computed get permissionsSelect() {
        return <select className="permissions-select" onChange={emptyFunction}>
            <option key={"Can Edit"} value={"Can Edit"}>
                Can Edit
                        </option>
            <option key={"Can Add"} value={"Can Add"}>
                Can Add
                        </option>
            <option key={"Can View"} value={"Can View"}>
                Can View
                        </option>
            <option key={"Not Shared"} value={"Not Shared"}>
                Not Shared
                        </option>
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

    sharingItem(name: string, notify: boolean, editable: boolean, permission?: string) {
        return <div className="propertiesView-sharingTable-item">
            <div className="propertiesView-sharingTable-item-name" style={{ width: notify ? "70px" : "80px" }}> {name} </div>
            {notify ? this.notifyIcon : null}
            <div className="propertiesView-sharingTable-item-permission">
                {editable ? this.permissionsSelect : permission}
                {permission === "Owner" ? this.expansionIcon : null}
            </div>
        </div>;
    }

    @computed get sharingTable() {
        return <div className="propertiesView-sharingTable">
            {this.sharingItem("Me", false, false, "Owner")}
            {this.sharingItem("Public", false, true)}
            {this.sharingItem("Group 1", true, true)}
            {this.sharingItem("Group 2", true, true)}
        </div>;
    }

    render() {

        if (!this.selectedDoc) {
            return <div className="propertiesView" >
                <div className="propertiesView-title">
                    No Document Selected
            </div> </div>;
        }

        return <div className="propertiesView" >
            <div className="propertiesView-title">
                <div className="propertiesView-title-name">Properties </div>
                <div className="propertiesView-title-icon" onPointerDown={this.props.onDown}>
                    <FontAwesomeIcon icon="times" color="black" size="sm" />
                </div>
            </div>
            <div className="propertiesView-name">
                {this.selectedDoc.title}
            </div>
            <div className="propertiesView-settings">
                <div className="propertiesView-settings-title"> Document Actions </div>
                <div className="propertiesView-settings-content">
                    <PropertiesButtons />
                </div>
            </div>
            <div className="propertiesView-sharing">
                <div className="propertiesView-sharing-title"> Sharing {"&"} Permissions</div>
                <div className="propertiesView-sharing-content">
                    {this.sharingTable}
                </div>
            </div>
            <div className="propertiesView-fields">
                <div className="propertiesView-fields-title"> Fields</div>
                <div className="propertiesView-fields-content"> {this.expandedField} </div>
            </div>
            <div className="propertiesView-layout">
                <div className="propertiesView-layout-title" >Layout</div>
                <div className="propertiesView-layout-content">{this.layoutPreview}</div>
            </div>
        </div>;
    }
} 