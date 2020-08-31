import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, observable } from 'mobx';
import { observer } from "mobx-react";
import { Doc } from '../../../fields/Doc';
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
    protected _multiTouchDisposer?: import("../../util/InteractionUtils").InteractionUtils.MultiTouchEventDisposer | undefined;
    private _disposers: (DragManager.DragDropDisposer | undefined)[] = [undefined, undefined];

    @observable _animating = "";

    protected createDropTarget = (ele: HTMLDivElement | null, fieldKey: string, disposerId: number) => {
        this._disposers[disposerId]?.();
        if (ele) {
            // create disposers identified by disposerId to remove drag & drop listeners
            this._disposers[disposerId] = DragManager.MakeDropTarget(ele, (e, dropEvent) => this.dropHandler(e, dropEvent, fieldKey), this.layoutDoc);
        }
    }

    @undoBatch
    private dropHandler = (event: Event, dropEvent: DragManager.DropEvent, fieldKey: string) => {
        if (dropEvent.complete.docDragData) {
            event.stopPropagation(); // prevent parent Doc from registering new position so that it snaps back into place
            const droppedDocs = dropEvent.complete.docDragData?.droppedDocuments;
            if (droppedDocs?.length) {
                this.dataDoc[fieldKey] = droppedDocs[0];
            }
        }
    }

    private registerSliding = (e: React.PointerEvent<HTMLDivElement>, targetWidth: number) => {
        setupMoveUpEvents(this, e, this.onPointerMove, emptyFunction, action(() => {
            // on click, animate slider movement to the targetWidth
            this._animating = "all 1s";
            this.layoutDoc._clipWidth = targetWidth * 100 / this.props.PanelWidth();
            setTimeout(action(() => this._animating = ""), 1000);
        }), false);
    }

    @action
    private onPointerMove = ({ movementX }: PointerEvent) => {
        const width = movementX * this.props.ScreenToLocalTransform().Scale + NumCast(this.layoutDoc._clipWidth) / 100 * this.props.PanelWidth();
        if (width && width > 5 && width < this.props.PanelWidth()) {
            this.layoutDoc._clipWidth = width * 100 / this.props.PanelWidth();
        }
        return false;
    }

    @undoBatch
    clearDoc = (e: React.MouseEvent, fieldKey: string) => {
        e.stopPropagation; // prevent click event action (slider movement) in registerSliding
        delete this.dataDoc[fieldKey];
    }

    render() {
        const clipWidth = NumCast(this.layoutDoc._clipWidth) + "%";
        const childProps: DocumentViewProps = { ...this.props, pointerEvents: false, parentActive: this.props.active };
        const clearButton = (which: string) => {
            return <div className={`clear-button ${which}`}
                onPointerDown={e => e.stopPropagation()} // prevent triggering slider movement in registerSliding 
                onClick={e => this.clearDoc(e, `compareBox-${which}`)}>
                <FontAwesomeIcon className={`clear-button ${which}`} icon={"times"} size="sm" />
            </div>;
        };
        const displayDoc = (which: string) => {
            const whichDoc = Cast(this.dataDoc[`compareBox-${which}`], Doc, null);
            return whichDoc ? <>
                <ContentFittingDocumentView {...childProps} Document={whichDoc} />
                {clearButton(which)}
            </> :  // placeholder image if doc is missing
                <div className="placeholder">
                    <FontAwesomeIcon className="upload-icon" icon={"cloud-upload-alt"} size="lg" />
                </div>;
        };
        const displayBox = (which: string, index: number, cover: number) => {
            return <div className={`${which}Box-cont`} key={which} style={{ width: this.props.PanelWidth() }}
                onPointerDown={e => this.registerSliding(e, cover)}
                ref={ele => this.createDropTarget(ele, `compareBox-${which}`, index)} >
                {displayDoc(which)}
            </div>;
        };

        return (
            <div className={`comparisonBox${this.active() || SnappingManager.GetIsDragging() ? "-interactive" : ""}` /* change className to easily disable/enable pointer events in CSS */}>
                {displayBox("after", 1, this.props.PanelWidth() - 5)}
                <div className="clip-div" style={{ width: clipWidth, transition: this._animating, background: StrCast(this.layoutDoc._backgroundColor, "gray") }}>
                    {displayBox("before", 0, 5)}
                </div>

                <div className="slide-bar" style={{ left: `calc(${clipWidth} - 0.5px)` }}
                    onPointerDown={e => this.registerSliding(e, this.props.PanelWidth() / 2)} /* if clicked, return slide-bar to center */ >
                    <div className="slide-handle" />
                </div>
            </div >);
    }
}