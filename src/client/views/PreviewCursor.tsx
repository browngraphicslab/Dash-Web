import { action, observable } from 'mobx';
import { observer } from 'mobx-react';
import "normalize.css";
import * as React from 'react';
import "./PreviewCursor.scss";

@observer
export class PreviewCursor extends React.Component<{}> {
    private _prompt = React.createRef<HTMLDivElement>();
    //when focus is lost, this will remove the preview cursor
    @action onBlur = (): void => {
        PreviewCursor.Visible = false;
        PreviewCursor.hide();
    }

    @observable static clickPoint = [0, 0];
    @observable public static Visible = false;
    @observable public static hide = () => { };
    @action
    public static Show(hide: any, x: number, y: number) {
        if (this.hide)
            this.hide();
        this.clickPoint = [x, y];
        this.hide = hide;
        setTimeout(action(() => this.Visible = true), (1));
    }
    render() {
        if (!PreviewCursor.clickPoint) {
            return (null);
        }
        if (PreviewCursor.Visible && this._prompt.current) {
            this._prompt.current.focus();
        }
        return <div className="previewCursor" id="previewCursor" onBlur={this.onBlur} tabIndex={0} ref={this._prompt}
            style={{ transform: `translate(${PreviewCursor.clickPoint[0]}px, ${PreviewCursor.clickPoint[1]}px)`, opacity: PreviewCursor.Visible ? 1 : 0 }}>
            I
        </div >;
    }
}