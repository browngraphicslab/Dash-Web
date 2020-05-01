import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IReactionDisposer, reaction, computed } from "mobx";
import { observer } from "mobx-react";
import { Doc, Field } from "../../../new_fields/Doc";
import { documentSchema } from "../../../new_fields/documentSchemas";
import { makeInterface } from "../../../new_fields/Schema";
import { ComputedField } from "../../../new_fields/ScriptField";
import { Cast, NumCast, StrCast } from "../../../new_fields/Types";
import { emptyPath, returnFalse, returnOne, returnZero } from "../../../Utils";
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from "../ContextMenuItem";
import { ViewBoxAnnotatableComponent } from "../DocComponent";
import { ContentFittingDocumentView } from "./ContentFittingDocumentView";
import "./DocumentBox.scss";
import { FieldView, FieldViewProps } from "./FieldView";
import React = require("react");
import { TraceMobx } from "../../../new_fields/util";
import { Docs } from "../../documents/Documents";

type DocHolderBoxSchema = makeInterface<[typeof documentSchema]>;
const DocHolderBoxDocument = makeInterface(documentSchema);

@observer
export class DocHolderBox extends ViewBoxAnnotatableComponent<FieldViewProps, DocHolderBoxSchema>(DocHolderBoxDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(DocHolderBox, fieldKey); }
    _prevSelectionDisposer: IReactionDisposer | undefined;
    _selections: Doc[] = [];
    _curSelection = -1;
    componentDidMount() {
        this._prevSelectionDisposer = reaction(() => this.layoutDoc[this.props.fieldKey], (data) => {
            if (data instanceof Doc && !this.isSelectionLocked()) {
                this._selections.indexOf(data) !== -1 && this._selections.splice(this._selections.indexOf(data), 1);
                this._selections.push(data);
                this._curSelection = this._selections.length - 1;
            }
        });
    }
    componentWillUnmount() {
        this._prevSelectionDisposer?.();
    }
    specificContextMenu = (e: React.MouseEvent): void => {
        const funcs: ContextMenuProps[] = [];
        funcs.push({ description: (this.isSelectionLocked() ? "Show" : "Lock") + " Selection", event: () => this.toggleLockSelection, icon: "expand-arrows-alt" });
        funcs.push({ description: (this.layoutDoc.excludeCollections ? "Include" : "Exclude") + " Collections", event: () => this.layoutDoc.excludeCollections = !this.layoutDoc.excludeCollections, icon: "expand-arrows-alt" });
        funcs.push({ description: `${this.layoutDoc.forceActive ? "Select" : "Force"} Contents Active`, event: () => this.layoutDoc.forceActive = !this.layoutDoc.forceActive, icon: "project-diagram" });
        funcs.push({ description: `Show ${this.layoutDoc.childTemplateName !== "keyValue" ? "key values" : "contents"}`, event: () => this.layoutDoc.childTemplateName = this.layoutDoc.childTemplateName ? undefined : "keyValue", icon: "project-diagram" });

        ContextMenu.Instance.addItem({ description: "Options...", subitems: funcs, icon: "asterisk" });
    }
    lockSelection = () => {
        this.layoutDoc[this.props.fieldKey] = this.layoutDoc[this.props.fieldKey];
    }
    showSelection = () => {
        this.layoutDoc[this.props.fieldKey] = ComputedField.MakeFunction(`selectedDocs(self,this.excludeCollections,[_last_])?.[0]`);
    }
    isSelectionLocked = () => {
        const kvpstring = Field.toKeyValueString(this.layoutDoc, this.props.fieldKey);
        return !kvpstring || kvpstring.includes("DOC");
    }
    toggleLockSelection = () => {
        !this.isSelectionLocked() ? this.lockSelection() : this.showSelection();
        return true;
    }
    prevSelection = () => {
        this.lockSelection();
        if (this._curSelection > 0) {
            this.layoutDoc[this.props.fieldKey] = this._selections[--this._curSelection];
            return true;
        }
    }
    nextSelection = () => {
        if (this._curSelection < this._selections.length - 1 && this._selections.length) {
            this.layoutDoc[this.props.fieldKey] = this._selections[++this._curSelection];
            return true;
        }
    }
    onPointerDown = (e: React.PointerEvent) => {
        if (this.active() && e.button === 0 && !e.ctrlKey) {
            e.stopPropagation();
        }
    }
    onLockClick = (e: React.MouseEvent) => {
        this.toggleLockSelection();
        (e.nativeEvent as any).formattedHandled = true;
        e.stopPropagation();
    }
    get xPad() { return NumCast(this.props.Document._xPadding); }
    get yPad() { return NumCast(this.props.Document._yPadding); }
    onClick = (e: React.MouseEvent) => {
        let hitWidget: boolean | undefined = false;
        if (this._contRef.current!.getBoundingClientRect().top + this.yPad > e.clientY) hitWidget = (() => { this.props.select(false); return true; })();
        else if (this._contRef.current!.getBoundingClientRect().bottom - this.yPad < e.clientY) hitWidget = (() => { this.props.select(false); return true; })();
        else {
            if (this._contRef.current!.getBoundingClientRect().left + this.xPad > e.clientX) hitWidget = this.prevSelection();
            if (this._contRef.current!.getBoundingClientRect().right - this.xPad < e.clientX) hitWidget = this.nextSelection();
        }
        if (hitWidget) {
            (e.nativeEvent as any).formattedHandled = true;
            e.stopPropagation();
        }
    }
    _contRef = React.createRef<HTMLDivElement>();
    pwidth = () => this.props.PanelWidth() - 2 * this.xPad;
    pheight = () => this.props.PanelHeight() - 2 * this.yPad;
    getTransform = () => this.props.ScreenToLocalTransform().translate(-this.xPad, -this.yPad);
    get renderContents() {
        const containedDoc = Cast(this.dataDoc[this.props.fieldKey], Doc, null);
        const childTemplateName = StrCast(this.layoutDoc.childTemplateName);
        if (containedDoc && childTemplateName && !containedDoc["layout_" + childTemplateName]) {
            setTimeout(() => {
                Doc.createCustomView(containedDoc, Docs.Create.StackingDocument, childTemplateName);
                Doc.expandTemplateLayout(Cast(containedDoc["layout_" + childTemplateName], Doc, null), containedDoc, undefined);
            }, 0);
        }
        const contents = !(containedDoc instanceof Doc) ? (null) : <ContentFittingDocumentView
            Document={containedDoc}
            DataDoc={undefined}
            LibraryPath={emptyPath}
            ContainingCollectionView={this as any} // bcz: hack!  need to pass a prop that can be used to select the container (ie, 'this') when the up selector in document decorations is clicked.  currently, the up selector allows only a containing collection to be selected
            ContainingCollectionDoc={undefined}
            fitToBox={true}
            layoutKey={childTemplateName ? "layout_" + childTemplateName : "layout"}
            rootSelected={this.props.isSelected}
            addDocument={this.props.addDocument}
            moveDocument={this.props.moveDocument}
            removeDocument={this.props.removeDocument}
            addDocTab={this.props.addDocTab}
            pinToPres={this.props.pinToPres}
            ScreenToLocalTransform={this.getTransform}
            renderDepth={this.props.renderDepth + 1}
            NativeHeight={returnZero}
            NativeWidth={returnZero}
            PanelWidth={this.pwidth}
            PanelHeight={this.pheight}
            focus={this.props.focus}
            parentActive={this.props.active}
            dontRegisterView={!this.isSelectionLocked()}
            whenActiveChanged={this.props.whenActiveChanged}
            bringToFront={returnFalse}
            ContentScaling={returnOne}
        />;
        return contents;
    }
    render() {
        TraceMobx();
        return <div className="documentBox-container" ref={this._contRef}
            onContextMenu={this.specificContextMenu}
            onPointerDown={this.onPointerDown} onClick={this.onClick}
            style={{
                background: StrCast(this.layoutDoc.backgroundColor),
                border: `#00000021 solid ${this.xPad}px`,
                borderTop: `#0000005e solid ${this.yPad}px`,
                borderBottom: `#0000005e solid ${this.yPad}px`,
            }}>
            {this.renderContents}
            <div className="documentBox-lock" onClick={this.onLockClick}
                style={{ marginTop: - this.yPad }}>
                <FontAwesomeIcon icon={this.isSelectionLocked() ? "lock" : "unlock"} size="sm" />
            </div>
        </div >;
    }
}
