import * as React from 'react';
import { observer } from 'mobx-react';
import "./NaviconButton.scss";
import * as $ from 'jquery';


export class NaviconButton extends React.Component {

    componentDidMount = () => {
        $(document).ready(function () {
            var hamburger = $('#hamburger-icon');
            hamburger.click(function () {
                hamburger.toggleClass('active');
                return false;
            });
        });
    }

    render() {
        return (
            <a id="hamburger-icon" href="#" title="Menu">
                <span className="line line-1"></span>
                <span className="line line-2"></span>
                <span className="line line-3"></span>
            </a>
        );
    }
}