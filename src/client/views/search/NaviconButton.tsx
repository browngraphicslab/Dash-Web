import * as React from 'react';
import { observer } from 'mobx-react';
import "./NaviconButton.scss";
import * as $ from 'jquery';
import { observable } from 'mobx';

export interface NaviconProps {
    onClick(): void;
}

export class NaviconButton extends React.Component<NaviconProps> {

    @observable private _ref: React.RefObject<HTMLAnchorElement> = React.createRef();

    componentDidMount = () => {
        const that = this;
        if (this._ref.current) {
            this._ref.current.addEventListener("click", function (e) {
                e.preventDefault();
                if (that._ref.current) {
                    that._ref.current.classList.toggle('active');
                    return false;
                }
            });
        }
    }

    render() {
        return (
            <a id="hamburger-icon" href="#" ref={this._ref} title="Menu">
                <span className="line line-1"></span>
                <span className="line line-2"></span>
                <span className="line line-3"></span>
            </a>
        );
    }
}