import { library } from '@fortawesome/fontawesome-svg-core';
import { faEye } from '@fortawesome/free-regular-svg-icons';
import { faAsterisk, faBrain, faFileAudio, faImage, faPaintBrush, faTimes, faCloudUploadAlt } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, observable, runInAction, Lambda } from 'mobx';
import { observer } from "mobx-react";
import { Doc } from '../../../new_fields/Doc';
import { documentSchema } from '../../../new_fields/documentSchemas';
import { Id } from '../../../new_fields/FieldSymbols';
import { createSchema, listSpec, makeInterface } from '../../../new_fields/Schema';
import { ComputedField } from '../../../new_fields/ScriptField';
import { Cast, NumCast, StrCast } from '../../../new_fields/Types';
import { DragManager } from '../../util/DragManager';
import { ViewBoxAnnotatableComponent } from '../DocComponent';
import { FieldView, FieldViewProps } from './FieldView';
import "./ComparisonBox.scss";
import React = require("react");
import { ContentFittingDocumentView } from './ContentFittingDocumentView';

library.add(faImage, faEye as any, faPaintBrush, faBrain);
library.add(faFileAudio, faAsterisk);

export const pageSchema = createSchema({
    beforeDoc: "string",
    afterDoc: "string"
});

type ComparisonDocument = makeInterface<[typeof pageSchema, typeof documentSchema]>;
const ComparisonDocument = makeInterface(pageSchema, documentSchema);

@observer
export class ComparisonBox extends ViewBoxAnnotatableComponent<FieldViewProps, ComparisonDocument>(ComparisonDocument) {
    protected multiTouchDisposer?: import("../../util/InteractionUtils").InteractionUtils.MultiTouchEventDisposer | undefined;

    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(ComparisonBox, fieldKey); }

    private _beforeDropDisposer?: DragManager.DragDropDisposer;
    private _afterDropDisposer?: DragManager.DragDropDisposer;

    protected createDropTarget = (ele: HTMLDivElement | null, fieldKey: string) => {
        if (ele) {
            return DragManager.MakeDropTarget(ele, (event, dropEvent) => this.dropHandler(event, dropEvent, fieldKey));
        }
    }

    private dropHandler = (event: Event, dropEvent: DragManager.DropEvent, fieldKey: string) => {
        const droppedDocs = dropEvent.complete.docDragData?.droppedDocuments;
        if (droppedDocs?.length) {
            this.props.Document[fieldKey] = Doc.MakeAlias(droppedDocs[0]);
        }
    }

    @action
    private registerSliding = (e: React.PointerEvent<HTMLDivElement>) => {
        e.stopPropagation();
        e.preventDefault();
        window.removeEventListener("pointermove", this.onPointerMove);
        window.removeEventListener("pointerup", this.onPointerUp);
        window.addEventListener("pointermove", this.onPointerMove);
        window.addEventListener("pointerup", this.onPointerUp);
    }

    private resizeUpdater: Lambda = () => { };

    componentWillMount() {
        this.props.Document.clipWidth = this.props.PanelWidth() / 2;

        //preserve before/after ratio during resizing
        this.resizeUpdater = computed(() => this.props.PanelWidth()).observe(({ oldValue, newValue }) =>
            this.props.Document.clipWidth = NumCast(this.props.Document.clipWidth) / NumCast(oldValue) * newValue
        );
    }

    componentWillUnmount() {
        this.resizeUpdater();
    }

    private onPointerMove = ({ movementX }: PointerEvent) => {
        //is it ok to use NumCast
        const width = movementX * this.props.ScreenToLocalTransform().Scale + NumCast(this.props.Document.clipWidth);
        if (width && width > 5 && width < this.props.PanelWidth()) {
            this.props.Document.clipWidth = width;
        }
    }

    @action
    private onPointerUp = () => {
        window.removeEventListener("pointermove", this.onPointerMove);
        window.removeEventListener("pointerup", this.onPointerUp);
    }

    clearBeforeDoc = (e: React.MouseEvent) => {
        e.stopPropagation;
        e.preventDefault;
        delete this.props.Document.beforeDoc;
    }

    clearAfterDoc = (e: React.MouseEvent) => {
        e.stopPropagation;
        e.preventDefault;
        delete this.props.Document.afterDoc;
    }

    get fieldKey() {
        return this.props.fieldKey.startsWith("@") ? StrCast(this.props.Document[this.props.fieldKey]) : this.props.fieldKey;
    }

    render() {
        const beforeDoc = this.props.Document.beforeDoc as Doc;
        const afterDoc = this.props.Document.afterDoc as Doc;
        const clipWidth = this.props.Document.clipWidth as Number;
        return (
            <div className="comparisonBox">
                {/* wraps around before image and slider bar */}
                <div className="clip-div" style={{ width: clipWidth + "px" }}>
                    <div
                        className="beforeBox-cont"
                        key={this.props.Document[Id]}
                        ref={(ele) => {
                            this._beforeDropDisposer && this._beforeDropDisposer();
                            this._beforeDropDisposer = this.createDropTarget(ele, "beforeDoc");
                        }}
                        style={{ width: this.props.PanelWidth() }}>
                        {
                            beforeDoc ?
                                <>
                                    <ContentFittingDocumentView {...this.props}
                                        Document={beforeDoc}
                                        getTransform={this.props.ScreenToLocalTransform} />
                                    <div className="clear-button before" onClick={(e) => this.clearBeforeDoc(e)}>
                                        <FontAwesomeIcon className="clear-button before" icon={faTimes} size="sm" />
                                    </div>
                                </>
                                :
                                <div className="placeholder">
                                    <FontAwesomeIcon className="upload-icon" icon={faCloudUploadAlt} size="lg" />
                                </div>
                        }
                    </div>
                    <div className="slide-bar" onPointerDown={e => this.registerSliding(e)} />
                </div>
                <div
                    className="afterBox-cont"
                    key={this.props.Document[Id]}
                    ref={(ele) => {
                        this._afterDropDisposer && this._afterDropDisposer();
                        this._afterDropDisposer = this.createDropTarget(ele, "afterDoc");
                    }}>
                    {
                        afterDoc ?
                            <>
                                <ContentFittingDocumentView {...this.props}
                                    Document={afterDoc}
                                    getTransform={this.props.ScreenToLocalTransform} />
                                <div className="clear-button after" onClick={(e) => this.clearAfterDoc(e)}>
                                    <FontAwesomeIcon className="clear-button after" icon={faTimes} size="sm" />
                                </div>
                            </>
                            :
                            <div className="placeholder">
                                <FontAwesomeIcon className="upload-icon" icon={faCloudUploadAlt} size="lg" />
                            </div>
                    }
                </div>
            </div >);
    }
}