import { action, computed, observable } from 'mobx';
import { observer } from 'mobx-react';
import "normalize.css";
import * as React from 'react';
import { Doc, DocListCast, Opt } from '../../fields/Doc';
import { emptyFunction } from '../../Utils';
import { SetupDrag } from '../util/DragManager';
import "./MainViewNotifs.scss";
import { CollectionDockingView } from './collections/CollectionDockingView';


@observer
export class MainViewNotifs extends React.Component {

    @observable static NotifsCol: Opt<Doc>;
    openNotifsCol = () => {
        if (MainViewNotifs.NotifsCol) {
            CollectionDockingView.AddRightSplit(MainViewNotifs.NotifsCol);
        }
    }
    render() {
        const length = MainViewNotifs.NotifsCol ? DocListCast(MainViewNotifs.NotifsCol.data).length : 0;
        const notifsRef = React.createRef<HTMLDivElement>();
        const dragNotifs = action(() => MainViewNotifs.NotifsCol!);
        return <div className="mainNotifs-container" ref={notifsRef}>
            <button className="mainNotifs-badge" style={{ display: length > 0 ? "initial" : "none" }}
                onClick={this.openNotifsCol} onPointerDown={MainViewNotifs.NotifsCol ? SetupDrag(notifsRef, dragNotifs) : emptyFunction}>
                {length}
            </button>
        </div>;
    }
}
