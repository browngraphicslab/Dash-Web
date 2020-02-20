import { IReactionDisposer, reaction } from "mobx";
import { observer } from "mobx-react";
import { Doc, Field } from "../../../new_fields/Doc";
import { documentSchema } from "../../../new_fields/documentSchemas";
import { List } from "../../../new_fields/List";
import { makeInterface } from "../../../new_fields/Schema";
import { ComputedField } from "../../../new_fields/ScriptField";
import { Cast, StrCast, BoolCast } from "../../../new_fields/Types";
import { emptyFunction, emptyPath } from "../../../Utils";
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from "../ContextMenuItem";
import { DocComponent, DocAnnotatableComponent } from "../DocComponent";
import { ContentFittingDocumentView } from "./ContentFittingDocumentView";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import "./DocumentBox.scss";
import { FieldView, FieldViewProps } from "./FieldView";
import React = require("react");

type DocBoxSchema = makeInterface<[typeof documentSchema]>;
const DocBoxDocument = makeInterface(documentSchema);

@observer
export class DocumentBox extends DocAnnotatableComponent<FieldViewProps, DocBoxSchema>(DocBoxDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(DocumentBox, fieldKey); }
    _prevSelectionDisposer: IReactionDisposer | undefined;
    _selections: Doc[] = [];
    _curSelection = -1;
    componentDidMount() {
        this._prevSelectionDisposer = reaction(() => Cast(this.props.Document[this.props.fieldKey], Doc) as Doc, (data) => {
            if (data && !this._selections.includes(data)) {
                this._selections.length = ++this._curSelection;
                this._selections.push(data);
            }
        });
    }
    componentWillUnmount() {
        this._prevSelectionDisposer && this._prevSelectionDisposer();
    }
    specificContextMenu = (e: React.MouseEvent): void => {
        const funcs: ContextMenuProps[] = [];
        funcs.push({ description: (this.isSelectionLocked() ? "Show" : "Lock") + " Selection", event: () => this.toggleLockSelection, icon: "expand-arrows-alt" });
        funcs.push({ description: `${this.props.Document.forceActive ? "Select" : "Force"} Contents Active`, event: () => this.props.Document.forceActive = !this.props.Document.forceActive, icon: "project-diagram" });

        ContextMenu.Instance.addItem({ description: "DocumentBox Funcs...", subitems: funcs, icon: "asterisk" });
    }
    lockSelection = () => {
        Doc.GetProto(this.props.Document)[this.props.fieldKey] = this.props.Document[this.props.fieldKey];
    }
    showSelection = () => {
        Doc.GetProto(this.props.Document)[this.props.fieldKey] = ComputedField.MakeFunction("selectedDocs(this,true,[_last_])?.[0]");
    }
    isSelectionLocked = () => {
        const kvpstring = Field.toKeyValueString(this.props.Document, this.props.fieldKey);
        return !(kvpstring.startsWith("=") || kvpstring.startsWith(":="));
    }
    toggleLockSelection = () => {
        !this.isSelectionLocked() ? this.lockSelection() : this.showSelection();
    }
    prevSelection = () => {
        if (this._curSelection > 0) {
            Doc.UserDoc().SelectedDocs = new List([this._selections[--this._curSelection]]);
        }
    }
    nextSelection = () => {
        if (this._curSelection < this._selections.length - 1 && this._selections.length) {
            Doc.UserDoc().SelectedDocs = new List([this._selections[++this._curSelection]]);
        }
    }
    onPointerDown = (e: React.PointerEvent) => {
    }
    onClick = (e: React.MouseEvent) => {
        if (this._contRef.current!.getBoundingClientRect().top + 15 > e.clientY) this.toggleLockSelection();
        else {
            if (this._contRef.current!.getBoundingClientRect().left + 15 > e.clientX) this.prevSelection();
            if (this._contRef.current!.getBoundingClientRect().right - 15 < e.clientX) this.nextSelection();
        }
    }
    _contRef = React.createRef<HTMLDivElement>();
    pwidth = () => this.props.PanelWidth() - 30;
    pheight = () => this.props.PanelHeight() - 30;
    getTransform = () => this.props.ScreenToLocalTransform().translate(-15, -15);
    render() {
        const containedDoc = this.dataDoc[this.props.fieldKey] as Doc;
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
                renderDepth={this.props.Document.forceActive ? 0 : this.props.renderDepth + 1} // bcz: really need to have an 'alwaysSelected' prop that's not conflated with renderDepth
                PanelWidth={this.pwidth}
                PanelHeight={this.pheight}
                focus={this.props.focus}
                active={this.props.active}
                whenActiveChanged={this.props.whenActiveChanged}
            />}
        </div>;
    }
}
