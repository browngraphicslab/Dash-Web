import { library } from '@fortawesome/fontawesome-svg-core';
import { faEye } from '@fortawesome/free-regular-svg-icons';
import { faAsterisk, faBrain, faFileAudio, faImage, faPaintBrush, faTimes, faCloudUploadAlt } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, observable, runInAction, Lambda } from 'mobx';
import { observer } from "mobx-react";
import { Doc } from '../../../fields/Doc';
import { documentSchema } from '../../../fields/documentSchemas';
import { createSchema, makeInterface } from '../../../fields/Schema';
import { NumCast, Cast } from '../../../fields/Types';
import { DragManager } from '../../util/DragManager';
import { ViewBoxAnnotatableComponent } from '../DocComponent';
import { FieldView, FieldViewProps } from './FieldView';
import "./ComparisonBox.scss";
import React = require("react");
import { ContentFittingDocumentView } from './ContentFittingDocumentView';
import { undoBatch } from '../../util/UndoManager';
import { setupMoveUpEvents, emptyFunction } from '../../../Utils';
import { SnappingManager } from '../../util/SnappingManager';

library.add(faImage, faEye as any, faPaintBrush, faBrain);
library.add(faFileAudio, faAsterisk);

export const comparisonSchema = createSchema({});

type ComparisonDocument = makeInterface<[typeof comparisonSchema, typeof documentSchema]>;
const ComparisonDocument = makeInterface(comparisonSchema, documentSchema);

@observer
export class ComparisonBox extends ViewBoxAnnotatableComponent<FieldViewProps, ComparisonDocument>(ComparisonDocument) {
    protected multiTouchDisposer?: import("../../util/InteractionUtils").InteractionUtils.MultiTouchEventDisposer | undefined;

    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(ComparisonBox, fieldKey); }

    private _beforeDropDisposer?: DragManager.DragDropDisposer;
    private _afterDropDisposer?: DragManager.DragDropDisposer;

    protected createDropTarget = (ele: HTMLDivElement | null, fieldKey: string) => {
        if (ele) {
            return DragManager.MakeDropTarget(ele, (event, dropEvent) => this.dropHandler(event, dropEvent, fieldKey), this.layoutDoc);
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
            this._animating = true;
            this.dataDoc.clipWidth = targetWidth * 100 / this.props.PanelWidth();
            setTimeout(action(() => this._animating = false), 1000);
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
        e.preventDefault;
        delete this.dataDoc[fieldKey];
    }

    @observable _animating = false;
    render() {
        const beforeDoc = Cast(this.dataDoc.beforeDoc, Doc, null);
        const afterDoc = Cast(this.dataDoc.afterDoc, Doc, null);
        const clipWidth = NumCast(this.dataDoc.clipWidth);
        return (
            <div className={`comparisonBox${this.active() || SnappingManager.GetIsDragging() ? "-interactive" : ""}`}>
                <div className="afterBox-cont" key={"after"} onPointerDown={e => this.registerSliding(e, this.props.PanelWidth() - 5)}
                    ref={(ele) => {
                        this._afterDropDisposer?.();
                        this._afterDropDisposer = this.createDropTarget(ele, "afterDoc");
                    }}>
                    {afterDoc ? <>
                        <ContentFittingDocumentView {...this.props}
                            Document={afterDoc}
                            pointerEvents={false}
                            parentActive={this.props.active}
                        />
                        <div className="clear-button after" onClick={e => this.clearDoc(e, "afterDoc")}>
                            <FontAwesomeIcon className="clear-button after" icon={faTimes} size="sm" />
                        </div>
                    </> :
                        <div className="placeholder">
                            <FontAwesomeIcon className="upload-icon" icon={faCloudUploadAlt} size="lg" />
                        </div>}
                </div>
                <div className="clip-div" onPointerDown={e => this.registerSliding(e, 5)} style={{ width: clipWidth + "%", transition: this._animating ? "all 1s" : undefined }}>
                    {/* wraps around before image and slider bar */}
                    <div
                        className="beforeBox-cont"
                        key={"before"}
                        ref={(ele) => {
                            this._beforeDropDisposer?.();
                            this._beforeDropDisposer = this.createDropTarget(ele, "beforeDoc");
                        }}
                        style={{ width: this.props.PanelWidth() }}>
                        {
                            beforeDoc ?
                                <>
                                    <ContentFittingDocumentView {...this.props}
                                        Document={beforeDoc}
                                        pointerEvents={false}
                                        parentActive={this.props.active} />
                                    <div className="clear-button before" onClick={e => this.clearDoc(e, "beforeDoc")}>
                                        <FontAwesomeIcon className="clear-button before" icon={faTimes} size="sm" />
                                    </div>
                                </>
                                :
                                <div className="placeholder">
                                    <FontAwesomeIcon className="upload-icon" icon={faCloudUploadAlt} size="lg" />
                                </div>
                        }
                    </div>
                </div>

                <div className="slide-bar" style={{ left: `calc(${this.dataDoc.clipWidth}% - 0.5px)` }}>
                    <div className="slide-handle" />
                </div>
            </div >);
    }
}