import { action, computed } from 'mobx';
import { observer } from 'mobx-react';
import * as React from "react";
import { Doc } from '../../../new_fields/Doc';
import { documentSchema } from '../../../new_fields/documentSchemas';
import { makeInterface } from '../../../new_fields/Schema';
import { BoolCast, NumCast, ScriptCast, StrCast, Cast } from '../../../new_fields/Types';
import { DragManager } from '../../util/DragManager';
import { Transform } from '../../util/Transform';
import { undoBatch } from '../../util/UndoManager';
import { ContentFittingDocumentView } from '../nodes/ContentFittingDocumentView';
import { CollectionSubView } from './CollectionSubView';
import { List } from '../../../new_fields/List';
import { returnZero } from '../../../Utils';



type GridSchema = makeInterface<[typeof documentSchema]>;
const GridSchema = makeInterface(documentSchema);

export class CollectionGridView extends CollectionSubView(GridSchema) {
    render() {
        return (
            <div>

            </div>
        );
    }
}
