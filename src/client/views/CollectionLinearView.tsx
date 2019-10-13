import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, observable, computed } from 'mobx';
import { observer } from 'mobx-react';
import * as React from 'react';
import { Doc, DocListCast, Opt } from '../../new_fields/Doc';
import { InkTool } from '../../new_fields/InkField';
import { ObjectField } from '../../new_fields/ObjectField';
import { ScriptField } from '../../new_fields/ScriptField';
import { NumCast, StrCast } from '../../new_fields/Types';
import { emptyFunction, returnEmptyString, returnOne, returnTrue, returnFalse } from '../../Utils';
import { Docs } from '../documents/Documents';
import { DragManager } from '../util/DragManager';
import { Transform } from '../util/Transform';
import { UndoManager } from '../util/UndoManager';
import { InkingControl } from './InkingControl';
import { DocumentView } from './nodes/DocumentView';
import "./CollectionLinearView.scss";

interface CollectionLinearViewProps {
    Document: Doc;
    fieldKey: string;
}

@observer
export class CollectionLinearView extends React.Component<CollectionLinearViewProps>{
    @observable public addMenuToggle = React.createRef<HTMLInputElement>();
    private _dropDisposer?: DragManager.DragDropDisposer;

    componentWillUnmount() {
        this._dropDisposer && this._dropDisposer();
    }

    protected createDropTarget = (ele: HTMLLabelElement) => { //used for stacking and masonry view
        this._dropDisposer && this._dropDisposer();
        if (ele) {
            this._dropDisposer = DragManager.MakeDropTarget(ele, { handlers: { drop: this.drop.bind(this) } });
        }
    }

    drop = action((e: Event, de: DragManager.DropEvent) => {
        (de.data as DragManager.DocumentDragData).draggedDocuments.map(doc => {
            if (!doc.onDragStart) {
                let dbox = Docs.Create.FontIconDocument({ nativeWidth: 100, nativeHeight: 100, width: 100, height: 100, backgroundColor: StrCast(doc.backgroundColor), title: "Custom", icon: "bolt" });
                dbox.dragFactory = doc;
                dbox.removeDropProperties = doc.removeDropProperties instanceof ObjectField ? ObjectField.MakeCopy(doc.removeDropProperties) : undefined;
                dbox.onDragStart = ScriptField.MakeFunction('getCopy(this.dragFactory, true)');
                doc = dbox;
            }
            Doc.AddDocToList(this.props.Document, this.props.fieldKey, doc);
        });
    });

    selected = (tool: InkTool) => {
        if (!InkingControl.Instance || InkingControl.Instance.selectedTool === InkTool.None) return { display: "none" };
        if (InkingControl.Instance.selectedTool === tool) {
            return { color: "#61aaa3", fontSize: "50%" };
        }
        return { fontSize: "50%" };
    }

    render() {
        return <div className="collectionLinearView">
            <input id="collectionLinearView-toggle" type="checkbox" ref={this.addMenuToggle} />
            <label htmlFor="collectionLinearView-toggle" ref={this.createDropTarget} title="Close Menu"><p>+</p></label>

            <div className="collectionLinearView-content">
                <button key="undo" className="collectionLinearView-add-button collectionLinearView-round-button" title="Undo" style={{ opacity: UndoManager.CanUndo() ? 1 : 0.5, transition: "0.4s ease all" }} onClick={() => UndoManager.Undo()}><FontAwesomeIcon icon="undo-alt" size="sm" /></button>
                <button key="redo" className="collectionLinearView-add-button collectionLinearView-round-button" title="Redo" style={{ opacity: UndoManager.CanRedo() ? 1 : 0.5, transition: "0.4s ease all" }} onClick={() => UndoManager.Redo()}><FontAwesomeIcon icon="redo-alt" size="sm" /></button>

                {DocListCast(this.props.Document[this.props.fieldKey]).map(doc => <div className="collectionLinearView-docBtn" key={StrCast(doc.title)} >
                    <DocumentView
                        Document={doc}
                        DataDoc={undefined}
                        addDocument={undefined}
                        addDocTab={returnFalse}
                        pinToPres={emptyFunction}
                        removeDocument={(doc: Doc) => Doc.RemoveDocFromList(this.props.Document, this.props.fieldKey, doc)}
                        ruleProvider={undefined}
                        onClick={undefined}
                        ScreenToLocalTransform={Transform.Identity}
                        ContentScaling={() => 35 / NumCast(doc.nativeWidth, 35)}
                        PanelWidth={() => 35}
                        PanelHeight={() => 35}
                        renderDepth={0}
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

                <button className="collectionLinearView-toolbar-button collectionLinearView-round-button" title="Ink" onClick={() => InkingControl.Instance.toggleDisplay()}><FontAwesomeIcon icon="pen-nib" size="sm" /> </button>
                <button key="pen" onClick={() => InkingControl.Instance.switchTool(InkTool.Pen)} title="Pen" style={this.selected(InkTool.Pen)}><FontAwesomeIcon icon="pen" size="lg" /></button>
                <button key="marker" onClick={() => InkingControl.Instance.switchTool(InkTool.Highlighter)} title="Highlighter" style={this.selected(InkTool.Highlighter)}><FontAwesomeIcon icon="highlighter" size="lg" /></button>
                <button key="eraser" onClick={() => InkingControl.Instance.switchTool(InkTool.Eraser)} title="Eraser" style={this.selected(InkTool.Eraser)}><FontAwesomeIcon icon="eraser" size="lg" /></button>
                <InkingControl />
            </div>
        </div>;
    }
}