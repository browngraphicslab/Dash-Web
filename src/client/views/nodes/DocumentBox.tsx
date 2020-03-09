import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IReactionDisposer, reaction, computed } from "mobx";
import { observer } from "mobx-react";
import { Doc, Field } from "../../../new_fields/Doc";
import { documentSchema } from "../../../new_fields/documentSchemas";
import { makeInterface } from "../../../new_fields/Schema";
import { ComputedField } from "../../../new_fields/ScriptField";
import { Cast, StrCast } from "../../../new_fields/Types";
import { emptyPath } from "../../../Utils";
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from "../ContextMenuItem";
import { DocAnnotatableComponent } from "../DocComponent";
import { ContentFittingDocumentView } from "./ContentFittingDocumentView";
import "./DocumentBox.scss";
import { FieldView, FieldViewProps } from "./FieldView";
import React = require("react");
import { TraceMobx } from "../../../new_fields/util";

type DocBoxSchema = makeInterface<[typeof documentSchema]>;
const DocBoxDocument = makeInterface(documentSchema);

@observer
export class DocumentBox extends DocAnnotatableComponent<FieldViewProps, DocBoxSchema>(DocBoxDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(DocumentBox, fieldKey); }
    _prevSelectionDisposer: IReactionDisposer | undefined;
    _selections: Doc[] = [];
    _curSelection = -1;
    componentDidMount() {
        this._prevSelectionDisposer = reaction(() => this.contentDoc[this.props.fieldKey], (data) => {
            if (data instanceof Doc && !this.isSelectionLocked()) {
                this._selections.indexOf(data) !== -1 && this._selections.splice(this._selections.indexOf(data), 1);
                this._selections.push(data);
                this._curSelection = this._selections.length - 1;
            }
        });
    }
    componentWillUnmount() {
        this._prevSelectionDisposer && this._prevSelectionDisposer();
    }
    specificContextMenu = (e: React.MouseEvent): void => {
        const funcs: ContextMenuProps[] = [];
        funcs.push({ description: (this.isSelectionLocked() ? "Show" : "Lock") + " Selection", event: () => this.toggleLockSelection, icon: "expand-arrows-alt" });
        funcs.push({ description: (this.props.Document.excludeCollections ? "Include" : "Exclude") + " Collections", event: () => this.props.Document.excludeCollections = !this.props.Document.excludeCollections, icon: "expand-arrows-alt" });
        funcs.push({ description: `${this.props.Document.forceActive ? "Select" : "Force"} Contents Active`, event: () => this.props.Document.forceActive = !this.props.Document.forceActive, icon: "project-diagram" });

        ContextMenu.Instance.addItem({ description: "DocumentBox Funcs...", subitems: funcs, icon: "asterisk" });
    }
    @computed get contentDoc() {
        return (this.props.Document.isTemplateDoc || this.props.Document.isTemplateForField ? this.props.Document : Doc.GetProto(this.props.Document));
    }
    lockSelection = () => {
        this.contentDoc[this.props.fieldKey] = this.props.Document[this.props.fieldKey];
    }
    showSelection = () => {
        this.contentDoc[this.props.fieldKey] = ComputedField.MakeFunction(`selectedDocs(this,this.excludeCollections,[_last_])?.[0]`);
    }
    isSelectionLocked = () => {
        const kvpstring = Field.toKeyValueString(this.contentDoc, this.props.fieldKey);
        return !kvpstring || kvpstring.includes("DOC");
    }
    toggleLockSelection = () => {
        !this.isSelectionLocked() ? this.lockSelection() : this.showSelection();
        return true;
    }
    prevSelection = () => {
        this.lockSelection();
        if (this._curSelection > 0) {
            this.contentDoc[this.props.fieldKey] = this._selections[--this._curSelection];
            return true;
        }
    }
    nextSelection = () => {
        if (this._curSelection < this._selections.length - 1 && this._selections.length) {
            this.contentDoc[this.props.fieldKey] = this._selections[++this._curSelection];
            return true;
        }
    }
    onPointerDown = (e: React.PointerEvent) => {
        if (e.button === 0 && !e.ctrlKey) {
            e.stopPropagation();
        }
    }
    onClick = (e: React.MouseEvent) => {
        let hitWidget: boolean | undefined = false;
        if (this._contRef.current!.getBoundingClientRect().top + 15 > e.clientY) hitWidget = this.toggleLockSelection();
        else if (this._contRef.current!.getBoundingClientRect().bottom - 15 < e.clientY) hitWidget = (() => { this.props.select(false); return true; })();
        else {
            if (this._contRef.current!.getBoundingClientRect().left + 15 > e.clientX) hitWidget = this.prevSelection();
            if (this._contRef.current!.getBoundingClientRect().right - 15 < e.clientX) hitWidget = this.nextSelection();
        }
        if (hitWidget) {
            (e.nativeEvent as any).formattedHandled = true;
            e.stopPropagation();
        }
    }
    _contRef = React.createRef<HTMLDivElement>();
    pwidth = () => this.props.PanelWidth() - 30;
    pheight = () => this.props.PanelHeight() - 30;
    getTransform = () => this.props.ScreenToLocalTransform().translate(-15, -15);
    render() {
        TraceMobx();
        const containedDoc = this.contentDoc[this.props.fieldKey];
        return <div className="documentBox-container" ref={this._contRef}
            onContextMenu={this.specificContextMenu}
            onPointerDown={this.onPointerDown} onClick={this.onClick}
            style={{ background: StrCast(this.props.Document.backgroundColor) }}>
            <div className="documentBox-lock">
                <FontAwesomeIcon icon={this.isSelectionLocked() ? "lock" : "unlock"} size="sm" />
            </div>
            {!(containedDoc instanceof Doc) ? (null) : <ContentFittingDocumentView
                Document={containedDoc}
                DataDocument={undefined}
                LibraryPath={emptyPath}
                fitToBox={this.props.fitToBox}
                addDocument={this.props.addDocument}
                moveDocument={this.props.moveDocument}
                removeDocument={this.props.removeDocument}
                addDocTab={this.props.addDocTab}
                pinToPres={this.props.pinToPres}
                getTransform={this.getTransform}
                renderDepth={this.props.renderDepth + 1} // bcz: need a forceActive prop here ... not the same as renderDepth = 0
                PanelWidth={this.pwidth}
                PanelHeight={this.pheight}
                focus={this.props.focus}
                active={this.props.active}
                dontRegisterView={!this.isSelectionLocked()}
                whenActiveChanged={this.props.whenActiveChanged}
            />}
        </div>;
    }
}
