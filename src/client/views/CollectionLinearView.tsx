import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, observable, computed } from 'mobx';
import { observer } from 'mobx-react';
import * as React from 'react';
import { Doc, DocListCast, Opt } from '../../new_fields/Doc';
import { InkTool } from '../../new_fields/InkField';
import { ObjectField } from '../../new_fields/ObjectField';
import { ScriptField } from '../../new_fields/ScriptField';
import { NumCast, StrCast } from '../../new_fields/Types';
import { emptyFunction, returnEmptyString, returnOne, returnTrue, returnFalse, Utils } from '../../Utils';
import { Docs } from '../documents/Documents';
import { DragManager } from '../util/DragManager';
import { Transform } from '../util/Transform';
import { UndoManager } from '../util/UndoManager';
import { InkingControl } from './InkingControl';
import { DocumentView, documentSchema } from './nodes/DocumentView';
import "./CollectionLinearView.scss";
import { makeInterface } from '../../new_fields/Schema';
import { CollectionSubView } from './collections/CollectionSubView';


type LinearDocument = makeInterface<[typeof documentSchema,]>;
const LinearDocument = makeInterface(documentSchema);

@observer
export class CollectionLinearView extends CollectionSubView(LinearDocument) {
    @observable public addMenuToggle = React.createRef<HTMLInputElement>();
    private _dropDisposer?: DragManager.DragDropDisposer;

    componentWillUnmount() {
        this._dropDisposer && this._dropDisposer();
    }

    protected createDropTarget = (ele: HTMLDivElement) => { //used for stacking and masonry view
        this._dropDisposer && this._dropDisposer();
        if (ele) {
            this._dropDisposer = DragManager.MakeDropTarget(ele, { handlers: { drop: this.drop.bind(this) } });
        }
    }

    drop = action((e: Event, de: DragManager.DropEvent) => {
        (de.data as DragManager.DocumentDragData).draggedDocuments.map((doc, i) => {
            let dbox = doc;
            if (!doc.onDragStart && this.props.Document.convertToButtons) {
                dbox = Docs.Create.FontIconDocument({ nativeWidth: 100, nativeHeight: 100, width: 100, height: 100, backgroundColor: StrCast(doc.backgroundColor), title: "Custom", icon: "bolt" });
                dbox.dragFactory = doc;
                dbox.removeDropProperties = doc.removeDropProperties instanceof ObjectField ? ObjectField.MakeCopy(doc.removeDropProperties) : undefined;
                dbox.onDragStart = ScriptField.MakeFunction('getCopy(this.dragFactory, true)');
            }
            (de.data as DragManager.DocumentDragData).droppedDocuments[i] = dbox;
        });
        e.stopPropagation();
        return super.drop(e, de);
    });

    selected = (tool: InkTool) => {
        if (!InkingControl.Instance || InkingControl.Instance.selectedTool === InkTool.None) return { display: "none" };
        if (InkingControl.Instance.selectedTool === tool) {
            return { color: "#61aaa3", fontSize: "50%" };
        }
        return { fontSize: "50%" };
    }

    public isCurrent(doc: Doc) { return !doc.isMinimized && (Math.abs(NumCast(doc.displayTimecode, -1) - NumCast(this.Document.currentTimecode, -1)) < 1.5 || NumCast(doc.displayTimecode, -1) === -1); }

    dimension = () => NumCast(this.props.Document.height) - 5;
    render() {
        let guid = Utils.GenerateGuid();
        return <div className="collectionLinearView-outer"><div className="collectionLinearView" ref={this.createDropTarget} >
            <input id={`${guid}`} type="checkbox" ref={this.addMenuToggle} />
            <label htmlFor={`${guid}`} style={{ marginTop: (this.dimension() - 36) / 2, marginBottom: "auto" }} title="Close Menu"><p>+</p></label>

            <div className="collectionLinearView-content">
                {this.props.showHiddenControls ? <button key="undo" className="collectionLinearView-add-button collectionLinearView-round-button" title="Undo" style={{ opacity: UndoManager.CanUndo() ? 1 : 0.5, transition: "0.4s ease all" }} onClick={() => UndoManager.Undo()}><FontAwesomeIcon icon="undo-alt" size="sm" /></button> : (null)}
                {this.props.showHiddenControls ? <button key="redo" className="collectionLinearView-add-button collectionLinearView-round-button" title="Redo" style={{ opacity: UndoManager.CanRedo() ? 1 : 0.5, transition: "0.4s ease all" }} onClick={() => UndoManager.Redo()}><FontAwesomeIcon icon="redo-alt" size="sm" /></button> : (null)}

                {this.childLayoutPairs.filter(pair => this.isCurrent(pair.layout)).map(pair =>
                    <div className="collectionLinearView-docBtn" style={{ width: this.dimension(), height: this.dimension() }} key={StrCast(pair.layout.title)} >
                        <DocumentView
                            Document={pair.layout}
                            DataDoc={pair.data}
                            addDocument={this.props.addDocument}
                            addDocTab={returnFalse}
                            pinToPres={emptyFunction}
                            removeDocument={this.props.removeDocument}
                            ruleProvider={undefined}
                            onClick={undefined}
                            ScreenToLocalTransform={Transform.Identity}
                            ContentScaling={() => this.dimension() / (10 + NumCast(pair.layout.nativeWidth, this.dimension()))} // ugh - need to get rid of this inline function to avoid recomputing
                            PanelWidth={this.dimension}
                            PanelHeight={this.dimension}
                            renderDepth={this.props.renderDepth + 1}
                            focus={emptyFunction}
                            backgroundColor={returnEmptyString}
                            parentActive={returnTrue}
                            whenActiveChanged={emptyFunction}
                            bringToFront={emptyFunction}
                            ContainingCollectionView={undefined}
                            ContainingCollectionDoc={undefined}
                            zoomToScale={emptyFunction}
                            getScale={returnOne}>
                        </DocumentView>
                    </div>)}
                {/* <li key="undoTest"><button className="add-button round-button" title="Click if undo isn't working" onClick={() => UndoManager.TraceOpenBatches()}><FontAwesomeIcon icon="exclamation" size="sm" /></button></li> */}
                {this.props.showHiddenControls ? <>
                    <button className="collectionLinearView-toolbar-button collectionLinearView-round-button" title="Ink" onClick={() => InkingControl.Instance.toggleDisplay()}><FontAwesomeIcon icon="pen-nib" size="sm" /> </button>
                    <button key="pen" onClick={() => InkingControl.Instance.switchTool(InkTool.Pen)} title="Pen" style={this.selected(InkTool.Pen)}><FontAwesomeIcon icon="pen" size="lg" /></button>
                    <button key="marker" onClick={() => InkingControl.Instance.switchTool(InkTool.Highlighter)} title="Highlighter" style={this.selected(InkTool.Highlighter)}><FontAwesomeIcon icon="highlighter" size="lg" /></button>
                    <button key="eraser" onClick={() => InkingControl.Instance.switchTool(InkTool.Eraser)} title="Eraser" style={this.selected(InkTool.Eraser)}><FontAwesomeIcon icon="eraser" size="lg" /></button>
                    <InkingControl />
                </> : (null)}
            </div>
        </div></div>;
    }
}