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


interface PropertiesViewProps {
    dataDoc: Doc;
    Document: Doc;
    width: number;
    height: number;
    renderDepth: number;
    ScreenToLocalTransform: () => Transform;
    //docView: DocumentView;
}

@observer
export class PropertiesView extends React.Component<PropertiesViewProps> {

    @computed get MAX_EMBED_HEIGHT() { return 200; }

    rtfWidth = () => Math.min(this.props.Document?.[WidthSym](), this.props.width - 20);
    rtfHeight = () => this.rtfWidth() <= this.props.Document?.[WidthSym]() ? Math.min(this.props.Document?.[HeightSym](), this.MAX_EMBED_HEIGHT) : this.MAX_EMBED_HEIGHT;

    docWidth = () => {
        const layoutDoc = this.props.Document;
        const aspect = NumCast(layoutDoc._nativeHeight, layoutDoc._fitWidth ? 0 : layoutDoc[HeightSym]()) / NumCast(layoutDoc._nativeWidth, layoutDoc._fitWidth ? 1 : layoutDoc[WidthSym]());
        if (aspect) return Math.min(layoutDoc[WidthSym](), Math.min(this.MAX_EMBED_HEIGHT / aspect, this.props.width - 20));
        return NumCast(layoutDoc._nativeWidth) ? Math.min(layoutDoc[WidthSym](), this.props.width - 20) : this.props.width - 20;
    }
    docHeight = () => {
        const layoutDoc = this.props.Document;
        return Math.max(70, Math.min(this.MAX_EMBED_HEIGHT, (() => {
            const aspect = NumCast(layoutDoc._nativeHeight, layoutDoc._fitWidth ? 0 : layoutDoc[HeightSym]()) / NumCast(layoutDoc._nativeWidth, layoutDoc._fitWidth ? 1 : layoutDoc[WidthSym]());
            if (aspect) return this.docWidth() * aspect;
            return layoutDoc._fitWidth ? (!this.props.dataDoc._nativeHeight ? NumCast(this.props.height) :
                Math.min(this.docWidth() * NumCast(layoutDoc.scrollHeight, NumCast(layoutDoc._nativeHeight)) / NumCast(layoutDoc._nativeWidth,
                    NumCast(this.props.height)))) :
                NumCast(layoutDoc._height) ? NumCast(layoutDoc._height) : 50;
        })()));
    }

    @computed get expandedField() {
        const ids: { [key: string]: string } = {};
        const doc = this.props.dataDoc;
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

    @computed get layoutPreview() {
        const layoutDoc = Doc.Layout(this.props.Document);
        const panelHeight = StrCast(Doc.LayoutField(layoutDoc)).includes("FormattedTextBox") ? this.rtfHeight : this.docHeight;
        const panelWidth = StrCast(Doc.LayoutField(layoutDoc)).includes("FormattedTextBox") ? this.rtfWidth : this.docWidth;
        return <div style={{ display: "inline-block", height: panelHeight() }} key={this.props.dataDoc[Id]}>
            <ContentFittingDocumentView
                Document={layoutDoc}
                DataDoc={this.props.dataDoc}
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
    }

    render() {
        return <div className="propertiesView" >
            <div className="propertiesView-title">
                Properties
            </div>
            <div className="propertiesView-name">
                Collection
            </div>
            <div className="propertiesView-settings">
                Settings
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