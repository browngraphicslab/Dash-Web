import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, observable, runInAction, Lambda, IReactionDisposer } from 'mobx';
import { observer } from "mobx-react";
import { Doc, Opt } from '../../../fields/Doc';
import { documentSchema } from '../../../fields/documentSchemas';
import { createSchema, makeInterface } from '../../../fields/Schema';
import { NumCast, Cast, StrCast } from '../../../fields/Types';
import { DragManager } from '../../util/DragManager';
import { ViewBoxAnnotatableComponent } from '../DocComponent';
import { FieldView, FieldViewProps } from './FieldView';
import "./ComparisonBox.scss";
import React = require("react");
import { ContentFittingDocumentView } from './ContentFittingDocumentView';
import { undoBatch } from '../../util/UndoManager';
import { setupMoveUpEvents, emptyFunction } from '../../../Utils';
import { SnappingManager } from '../../util/SnappingManager';
import { DocumentViewProps } from './DocumentView';

export const comparisonSchema = createSchema({});

type ComparisonDocument = makeInterface<[typeof comparisonSchema, typeof documentSchema]>;
const ComparisonDocument = makeInterface(comparisonSchema, documentSchema);

@observer
export class ComparisonBox extends ViewBoxAnnotatableComponent<FieldViewProps, ComparisonDocument>(ComparisonDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(ComparisonBox, fieldKey); }
    protected multiTouchDisposer?: import("../../util/InteractionUtils").InteractionUtils.MultiTouchEventDisposer | undefined;
    private _disposers: (DragManager.DragDropDisposer | undefined)[] = [undefined, undefined];

    @observable _animating = "";

    protected createDropTarget = (ele: HTMLDivElement | null, fieldKey: string, disposerId: number) => {
        this._disposers[disposerId]?.();
        if (ele) {
            this._disposers[disposerId] = DragManager.MakeDropTarget(ele, (e, dropEvent) => this.dropHandler(e, dropEvent, fieldKey), this.layoutDoc);
        }
    }

    @undoBatch
    private dropHandler = (event: Event, dropEvent: DragManager.DropEvent, fieldKey: string) => {
        event.stopPropagation();
        const droppedDocs = dropEvent.complete.docDragData?.droppedDocuments;
        if (droppedDocs?.length) {
            this.dataDoc[fieldKey] = droppedDocs[0];
            droppedDocs[0].isBackgound = true;
        }
    }

    private registerSliding = (e: React.PointerEvent<HTMLDivElement>, targetWidth: number) => {
        setupMoveUpEvents(this, e, this.onPointerMove, emptyFunction, action(() => {
            this._animating = "all 1s";
            this.dataDoc.clipWidth = targetWidth * 100 / this.props.PanelWidth();
            setTimeout(action(() => this._animating = ""), 1000);
        }), false);
    }

    @action
    private onPointerMove = ({ movementX }: PointerEvent) => {
        const width = movementX * this.props.ScreenToLocalTransform().Scale + NumCast(this.dataDoc.clipWidth) / 100 * this.props.PanelWidth();
        if (width && width > 5 && width < this.props.PanelWidth()) {
            this.dataDoc.clipWidth = width * 100 / this.props.PanelWidth();
        }
        return false;
    }

    @undoBatch
    clearDoc = (e: React.MouseEvent, fieldKey: string) => {
        e.stopPropagation;
        delete this.dataDoc[fieldKey];
    }

    render() {
        const clipWidth = NumCast(this.dataDoc.clipWidth) + "%";
        const childProps: DocumentViewProps = { ...this.props, pointerEvents: false, parentActive: this.props.active };
        const clearButton = (which: string) => {
            return <div className={`clear-button ${which}`} onPointerDown={e => e.stopPropagation()} onClick={e => this.clearDoc(e, `${which}Doc`)}>
                <FontAwesomeIcon className={`clear-button ${which}`} icon={"times"} size="sm" />
            </div>
        }
        const displayDoc = (which: string) => {
            const whichDoc = Cast(this.dataDoc[`${which}Doc`], Doc, null);
            return whichDoc ? <>
                <ContentFittingDocumentView {...childProps} Document={whichDoc} />
                {clearButton(which)}
            </> :  // placeholder image if doc is missing
                <div className="placeholder">
                    <FontAwesomeIcon className="upload-icon" icon={"cloud-upload-alt"} size="lg" />
                </div>
        }
        const displayBox = (which: string, index: number, cover: number) => {
            return <div className={`${which}Box-cont`} key={which} style={{ width: this.props.PanelWidth() }}
                onPointerDown={e => this.registerSliding(e, cover)}
                ref={ele => this.createDropTarget(ele, `${which}Doc`, index)} >
                {displayDoc(which)}
            </div>;
        }

        return (
            <div className={`comparisonBox${this.active() || SnappingManager.GetIsDragging() ? "-interactive" : ""}`}>
                {displayBox("after", 1, this.props.PanelWidth() - 5)}
                <div className="clip-div" style={{ width: clipWidth, transition: this._animating, background: StrCast(this.layoutDoc._backgroundColor, "gray") }}>
                    {displayBox("before", 0, 5)}
                </div>

                <div className="slide-bar" style={{ left: `calc(${clipWidth} - 0.5px)` }}>
                    <div className="slide-handle" />
                </div>
            </div >);
    }
}