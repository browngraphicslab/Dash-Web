import * as React from 'react';
import * as ReactDOM from 'react-dom';
import JsxParser from 'react-jsx-parser';

class Hello extends React.Component<{ firstName: string, lastName: string }> {
    render() {
        return <div>Hello {this.props.firstName} {this.props.lastName}</div>;
    }
}

class Test extends React.Component {
    render() {
        let jsx = "<Hello {...props}/>";
        let bindings = {
            props: {
                firstName: "First",
                lastName: "Last"
            }
        };
        return <JsxParser jsx={jsx} bindings={bindings} components={{ Hello }}></JsxParser>;
    }
}

ReactDOM.render((
    <div style={{ position: "absolute", width: "100%", height: "100%" }}>
        <Test />
    </div>),
    document.getElementById('root')
);