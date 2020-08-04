import { action, computed, observable } from 'mobx';
import { observer } from 'mobx-react';
import "normalize.css";
import * as React from 'react';
import { Doc, DocListCast, Opt } from '../../fields/Doc';
import { emptyFunction, returnFalse, setupMoveUpEvents } from '../../Utils';
import { SetupDrag, DragManager } from '../util/DragManager';
import "./MainViewNotifs.scss";
import { MainView } from './MainView';


@observer
export class MainViewNotifs extends React.Component {
    @observable static NotifsCol: Opt<Doc>;
    _notifsRef = React.createRef<HTMLDivElement>();

    onPointerDown = (e: React.PointerEvent) => {
        setupMoveUpEvents(this, e,
            (e: PointerEvent) => {
                const dragData = new DragManager.DocumentDragData([MainViewNotifs.NotifsCol!]);
                DragManager.StartDocumentDrag([this._notifsRef.current!], dragData, e.x, e.y);
                return true;
            },
            returnFalse,
            () => MainViewNotifs.NotifsCol && MainView.Instance.selectMenu(MainViewNotifs.NotifsCol, "Sharing"));
    }

    render() {
        const length = MainViewNotifs.NotifsCol ? DocListCast(MainViewNotifs.NotifsCol.data).length : 0;
        return <div className="mainNotifs-container" style={{ width: 15, height: 15 }} ref={this._notifsRef}>
            <button className="mainNotifs-badge" style={length > 0 ? { "display": "initial" } : { "display": "none" }}
                onPointerDown={this.onPointerDown} >
                {length}
            </button>
        </div>;
    }
}
