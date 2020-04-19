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

import "../../../../node_modules/react-grid-layout/css/styles.css";
import "../../../../node_modules/react-resizable/css/styles.css";
import GridLayout from 'react-grid-layout';

// import _ from "lodash";
// import Responsive from '../../lib/ResponsiveReactGridLayout';
// import WidthProvider from '../../lib/components/WidthProvider';
// import type { CompactType, Layout } from '../../lib/utils';
// const ResponsiveReactGridLayout = WidthProvider(Responsive);




type GridSchema = makeInterface<[typeof documentSchema]>;
const GridSchema = makeInterface(documentSchema);

export class CollectionGridView extends CollectionSubView(GridSchema) {
    render(): JSX.Element {
        const layout = [
            { i: 'a', x: 0, y: 0, w: 1, h: 2, static: true },
            { i: 'b', x: 1, y: 0, w: 3, h: 2, minW: 2, maxW: 4 },
            { i: 'c', x: 4, y: 0, w: 1, h: 2 }
        ];
        return (
            <GridLayout className="layout" layout={layout} cols={12} rowHeight={30} width={1200}>
                <div key="a">a</div>
                <div key="b">b</div>
                <div key="c">c</div>
            </GridLayout>
        );
    }
}
