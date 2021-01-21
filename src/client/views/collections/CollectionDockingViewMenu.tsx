import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "@material-ui/core";
import { action, computed, observable } from "mobx";
import { observer } from "mobx-react";
import * as React from "react";
import { DocumentButtonBar } from "../DocumentButtonBar";
import { DocumentView } from "../nodes/DocumentView";
const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;

@observer
export class CollectionDockingViewMenu extends React.Component<{ views: () => DocumentView[], Stack: any }> {
    customStylesheet(styles: any) {
        return {
            ...styles,
            panel: {
                ...styles.panel,
                minWidth: "100px"
            },
        };
    }
    _ref = React.createRef<HTMLDivElement>();

    @computed get flyout() {
        return (
            <div className="dockingViewButtonSelector-flyout" title=" " ref={this._ref}>
                <DocumentButtonBar views={this.props.views} stack={this.props.Stack} />
            </div>
        );
    }

    @observable _tooltipOpen: boolean = false;
    render() {
        return <Tooltip open={this._tooltipOpen} onClose={action(() => this._tooltipOpen = false)} title={<><div className="dash-tooltip">Tap for toolbar</div></>} placement="bottom">
            <span className="dockingViewButtonSelector"
                onPointerEnter={action(() => !this._ref.current?.getBoundingClientRect().width && (this._tooltipOpen = true))}
                onPointerDown={action(e => {
                    this.props.views()[0]?.select(false);
                    this._tooltipOpen = false;
                })} >
                <Flyout anchorPoint={anchorPoints.LEFT_TOP} content={this.flyout} stylesheet={this.customStylesheet}>
                    <>
                        <div className="moreInfoDot"></div>
                        <div className="moreInfoDot"></div>
                        <div className="moreInfoDot"></div>
                    </>
                </Flyout>
            </span>
        </Tooltip >;
    }
}
