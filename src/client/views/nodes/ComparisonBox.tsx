import { library } from '@fortawesome/fontawesome-svg-core';
import { faEye } from '@fortawesome/free-regular-svg-icons';
import { faAsterisk, faBrain, faFileAudio, faImage, faPaintBrush } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, observable, runInAction } from 'mobx';
import { observer } from "mobx-react";
import { Doc } from '../../../new_fields/Doc';
import { documentSchema } from '../../../new_fields/documentSchemas';
import { Id } from '../../../new_fields/FieldSymbols';
import { List } from '../../../new_fields/List';
import { ObjectField } from '../../../new_fields/ObjectField';
import { createSchema, listSpec, makeInterface } from '../../../new_fields/Schema';
import { ComputedField } from '../../../new_fields/ScriptField';
import { Cast, NumCast, StrCast } from '../../../new_fields/Types';
import { emptyFunction, returnOne, Utils, returnZero } from '../../../Utils';
import { Docs } from '../../documents/Documents';
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

    clearBeforeDoc = (e: PointerEvent) => {
        e.stopPropagation;
        delete this.props.Document.beforeDoc;
    }

    clearAfterDoc = (e: PointerEvent) => {
        e.stopPropagation;
        delete this.props.Document.afterDoc;
    }

    get fieldKey() {
        return this.props.fieldKey.startsWith("@") ? StrCast(this.props.Document[this.props.fieldKey]) : this.props.fieldKey;
    }

    render() {
        const beforeDoc = this.props.Document.beforeDoc as Doc;
        const afterDoc = this.props.Document.afterDoc as Doc;
        return (
            <div className={`comparisonBox`} style={{ backgroundColor: "blue" }}>
                <div
                    className="beforeBox-cont"
                    key={this.props.Document[Id]}
                    ref={(ele) => {
                        this._beforeDropDisposer && this._beforeDropDisposer();
                        this._beforeDropDisposer = this.createDropTarget(ele, "beforeDoc");
                    }}
                    style={{ backgroundColor: "red" }}
                >
                    {
                        beforeDoc ?
                            <ContentFittingDocumentView {...this.props}
                                Document={beforeDoc}
                                getTransform={this.props.ScreenToLocalTransform} />
                            : null
                    }
                </div>
                <div
                    className="afterBox-cont"
                    key={this.props.Document[Id]}
                    ref={(ele) => {
                        this._afterDropDisposer && this._afterDropDisposer();
                        this._afterDropDisposer = this.createDropTarget(ele, "afterDoc");
                    }}
                    style={{ backgroundColor: "orange" }}
                >
                    {
                        afterDoc ?
                            <ContentFittingDocumentView {...this.props}
                                Document={afterDoc}
                                getTransform={this.props.ScreenToLocalTransform} />
                            : null
                    }
                </div>
            </div>);
    }
}