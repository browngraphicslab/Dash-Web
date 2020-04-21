import * as React from 'react';
import { observer } from "mobx-react";
import { observable, action } from "mobx";


interface Props {

}

import "../../../../../node_modules/react-grid-layout/css/styles.css";
import GridLayout from 'react-grid-layout';

@observer
export default class Grid extends React.Component {
    render() {
        // layout is an array of objects, see the demo for more complete usage
        const layout = [
            { i: 'a', x: 0, y: 0, w: 1, h: 2, static: true },
            { i: 'b', x: 1, y: 0, w: 3, h: 2, minW: 2, maxW: 4 },
            { i: 'c', x: 4, y: 0, w: 1, h: 2 }
        ];
        return (
            // <div className="collectionGridView_contents"
            // style={}>
            <GridLayout className="layout" layout={layout} cols={12} rowHeight={30} width={1200}>
                <div key="a">a</div>
                <div key="b">b</div>
                <div key="c">c</div>
            </GridLayout>
        );
    }
}
