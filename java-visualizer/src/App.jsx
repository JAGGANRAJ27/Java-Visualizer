import { useMemo, useState } from "react";
import Editor from "@monaco-editor/react";

import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
} from "@xyflow/react";

import "@xyflow/react/dist/style.css";
import "./index.css";

/* =========================================================
   JAVA PARSER
========================================================= */

function parseJava(code) {
  const classes = [];

  /*
   * -------------------------------------------------------
   * CLASS PARSER
   * -------------------------------------------------------
   */

  const classRegex = /class\s+(\w+)\s*\{([\s\S]*?)\}/g;

  let classMatch;

  while ((classMatch = classRegex.exec(code)) !== null) {
    const className = classMatch[1];
    const body = classMatch[2];

    const fields = [];

    /*
     * Primitive / String fields
     */
    const primitiveRegex =
      /\b(String|int|double|float|boolean|char|long)\s+(\w+)\s*;/g;

    let fieldMatch;

    while ((fieldMatch = primitiveRegex.exec(body)) !== null) {
      fields.push({
        name: fieldMatch[2],
        type: fieldMatch[1],
        object: false,
      });
    }

    /*
     * Object fields
     *
     * Example:
     *
     * Pen pen;
     * Node next;
     */
    const objectFieldRegex =
      /\b([A-Z]\w*)\s+(\w+)\s*;/g;

    while ((fieldMatch = objectFieldRegex.exec(body)) !== null) {
      const type = fieldMatch[1];
      const name = fieldMatch[2];

      if (!fields.some((field) => field.name === name)) {
        fields.push({
          name,
          type,
          object: true,
        });
      }
    }

    classes.push({
      name: className,
      fields,
    });
  }

  /*
   * -------------------------------------------------------
   * LINKED LIST NODES
   * -------------------------------------------------------
   *
   * Example:
   *
   * Node first = new Node(10);
   * Node second = new Node(20);
   */

  const linkedListNodes = [];

  const linkedListNodeRegex =
    /\bNode\s+(\w+)\s*=\s*new\s+Node\s*\(([^)]*)\)\s*;/g;

  let linkedNodeMatch;

  while (
    (linkedNodeMatch = linkedListNodeRegex.exec(code)) !== null
  ) {
    const variableName = linkedNodeMatch[1];
    const value = linkedNodeMatch[2].trim();

    linkedListNodes.push({
      name: variableName,
      value: value || "null",
      next: null,
    });
  }

  /*
   * -------------------------------------------------------
   * LINKED LIST REFERENCES
   * -------------------------------------------------------
   *
   * Example:
   *
   * first.next = second;
   * second.next = third;
   */

  const linkedListReferences = [];

  const linkedListReferenceRegex =
    /(\w+)\.next\s*=\s*(\w+)\s*;/g;

  let linkedReferenceMatch;

  while (
    (linkedReferenceMatch =
      linkedListReferenceRegex.exec(code)) !== null
  ) {
    const from = linkedReferenceMatch[1];
    const to = linkedReferenceMatch[2];

    linkedListReferences.push({
      from,
      to,
    });

    const node = linkedListNodes.find(
      (item) => item.name === from
    );

    if (node) {
      node.next = to;
    }
  }

  /*
   * -------------------------------------------------------
   * NORMAL OBJECTS
   * -------------------------------------------------------
   *
   * Example:
   *
   * Pen p = new Pen("Blue", 24);
   *
   * Node objects are excluded because they are visualized
   * separately as Linked List nodes.
   */

  const objects = [];

  const objectRegex =
    /\b([A-Z]\w*)\s+(\w+)\s*=\s*new\s+([A-Z]\w*)\s*\(([^)]*)\)\s*;/g;

  let objectMatch;

  while ((objectMatch = objectRegex.exec(code)) !== null) {
    const variableName = objectMatch[2];
    const objectType = objectMatch[3];

    /*
     * Node objects are handled by the Linked List visualizer.
     */
    if (objectType === "Node") {
      continue;
    }

    const argumentsText = objectMatch[4].trim();

    const values =
      argumentsText.length === 0
        ? []
        : argumentsText
            .split(",")
            .map((value) => value.trim());

    objects.push({
      name: variableName,
      type: objectType,
      values,
    });
  }

  /*
   * -------------------------------------------------------
   * MAP CONSTRUCTOR VALUES TO CLASS ATTRIBUTES
   * -------------------------------------------------------
   */

  objects.forEach((object) => {
    const classDefinition = classes.find(
      (cls) => cls.name === object.type
    );

    if (!classDefinition) {
      object.attributes = [];
      return;
    }

    object.attributes = classDefinition.fields.map(
      (field, index) => ({
        name: field.name,
        type: field.type,
        value: object.values[index] ?? "null",
        object: field.object,
      })
    );
  });

  /*
   * -------------------------------------------------------
   * OBJECT REFERENCES
   * -------------------------------------------------------
   *
   * Example:
   *
   * person.pen = p;
   */

  const references = [];

  const referenceRegex =
    /(\w+)\.(\w+)\s*=\s*(\w+)\s*;/g;

  let referenceMatch;

  while (
    (referenceMatch = referenceRegex.exec(code)) !== null
  ) {
    const from = referenceMatch[1];
    const field = referenceMatch[2];
    const to = referenceMatch[3];

    /*
     * Do not treat linked-list .next references
     * as normal object references.
     */
    if (field === "next") {
      continue;
    }

    references.push({
      from,
      field,
      to,
    });
  }

  /*
   * -------------------------------------------------------
   * ARRAYS
   * -------------------------------------------------------
   *
   * Example:
   *
   * int[] numbers = {10, 20, 30, 40};
   */

  const arrays = [];

  const arrayRegex =
    /\b(\w+)\[\]\s+(\w+)\s*=\s*\{([^}]*)\}\s*;/g;

  let arrayMatch;

  while ((arrayMatch = arrayRegex.exec(code)) !== null) {
    const type = arrayMatch[1];
    const name = arrayMatch[2];
    const valuesText = arrayMatch[3];

    const values = valuesText
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    arrays.push({
      name,
      type,
      values,
    });
  }

  return {
    classes,
    objects,
    references,
    arrays,
    linkedListNodes,
    linkedListReferences,
  };
}

/* =========================================================
   CLASS NODE
========================================================= */

function ClassNode({ data }) {
  return (
    <div className="class-node">
      <Handle
        type="target"
        position={Position.Top}
      />

      <div className="class-header">
        {data.label}
      </div>

      <div className="class-fields">
        {data.fields.length === 0 ? (
          <div className="no-fields">
            No attributes
          </div>
        ) : (
          data.fields.map((field, index) => (
            <div
              className="class-field"
              key={index}
            >
              <span>{field.name}</span>

              <span className="field-type">
                {field.type}
              </span>
            </div>
          ))
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
      />
    </div>
  );
}

/* =========================================================
   OBJECT NODE
========================================================= */

function ObjectNode({ data }) {
  return (
    <div className="object-node">
      <Handle
        type="target"
        position={Position.Top}
      />

      <div className="object-header">
        <strong>{data.label}</strong>

        <span>
          : {data.type}
        </span>
      </div>

      <div className="object-attributes">
        {data.attributes?.map(
          (attribute, index) => (
            <div
              className="object-attribute"
              key={index}
            >
              <span>
                {attribute.name}
              </span>

              <span className="attribute-value">
                {attribute.value}
              </span>
            </div>
          )
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
      />
    </div>
  );
}

/* =========================================================
   ARRAY NODE
========================================================= */

function ArrayNode({ data }) {
  return (
    <div className="array-node">
      <Handle
        type="target"
        position={Position.Top}
      />

      <div className="array-header">
        <strong>{data.label}</strong>

        <span>
          : {data.type}[]
        </span>
      </div>

      <div className="array-container">
        {data.values.map(
          (value, index) => (
            <div
              className="array-cell-wrapper"
              key={index}
            >
              <div className="array-index">
                {index}
              </div>

              <div className="array-cell">
                {value}
              </div>
            </div>
          )
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
      />
    </div>
  );
}

/* =========================================================
   LINKED LIST NODE
========================================================= */

function LinkedListNode({ data }) {
  return (
    <div className="linked-list-node">

      <div className="ll-variable">
        {data.label}
      </div>

      <div className="ll-header">
        Node
      </div>

      <div className="ll-body">

        {/* DATA */}
        <div className="ll-data">

          <span className="ll-label">
            data
          </span>

          <strong>
            {data.value}
          </strong>

        </div>

        {/* NEXT */}
        <div className="ll-next">

          <span className="ll-label">
            next
          </span>

          <strong>
            {data.next || "null"}
          </strong>

        </div>

      </div>

      {/* Incoming connection */}
      <Handle
        id="input"
        type="target"
        position={Position.Left}
      />

      {/* Outgoing next connection */}
      <Handle
        id="next"
        type="source"
        position={Position.Right}
      />

    </div>
  );
}

/* =========================================================
   NODE TYPES
========================================================= */

const nodeTypes = {
  classNode: ClassNode,
  objectNode: ObjectNode,
  arrayNode: ArrayNode,
  linkedListNode: LinkedListNode,
};

/* =========================================================
   DEFAULT JAVA CODE
========================================================= */

const initialCode = `class Pen {

    String color;
    int price;

}

class Person {

    String name;
    Pen pen;

}

class Node {

    int data;
    Node next;

    Node(int data) {
        this.data = data;
        this.next = null;
    }

}

Pen p = new Pen("Blue", 24);

Person person = new Person("Jagganraj", null);

person.pen = p;

int[] numbers = {10, 20, 30, 40, 50};

Node first = new Node(10);
Node second = new Node(20);
Node third = new Node(30);

first.next = second;
second.next = third;
`;

/* =========================================================
   APP
========================================================= */

function App() {
  const [code, setCode] =
    useState(initialCode);

  const parsed = useMemo(
    () => parseJava(code),
    [code]
  );

  /*
   * -------------------------------------------------------
   * BUILD REACT FLOW NODES + EDGES
   * -------------------------------------------------------
   */

  const { nodes, edges } = useMemo(() => {
    const nodes = [];
    const edges = [];

    /*
     * =====================================================
     * CLASS NODES
     * =====================================================
     */

    parsed.classes.forEach(
      (classItem, index) => {
        nodes.push({
          id: `class-${classItem.name}`,

          type: "classNode",

          position: {
            x: index * 330 + 80,
            y: 50,
          },

          data: {
            label: classItem.name,
            fields: classItem.fields,
          },
        });
      }
    );

    /*
     * =====================================================
     * OBJECT NODES
     * =====================================================
     */

    parsed.objects.forEach(
      (object, index) => {
        nodes.push({
          id: `object-${object.name}`,

          type: "objectNode",

          position: {
            x: index * 330 + 80,
            y: 400,
          },

          data: {
            label: object.name,
            type: object.type,
            attributes:
              object.attributes || [],
          },
        });

        /*
         * Object -> Class
         */

        edges.push({
          id: `object-class-${object.name}`,

          source: `object-${object.name}`,

          target: `class-${object.type}`,

          type: "smoothstep",

          animated: true,

          label: "instance of",
        });
      }
    );

    /*
     * =====================================================
     * OBJECT REFERENCES
     * =====================================================
     *
     * person.pen = p;
     *
     * person -> p
     */

    parsed.references.forEach(
      (reference, index) => {
        const sourceExists =
          parsed.objects.some(
            (object) =>
              object.name ===
              reference.from
          );

        const targetExists =
          parsed.objects.some(
            (object) =>
              object.name ===
              reference.to
          );

        if (
          sourceExists &&
          targetExists
        ) {
          edges.push({
            id: `reference-${index}`,

            source: `object-${reference.from}`,

            target: `object-${reference.to}`,

            type: "smoothstep",

            animated: true,

            label: reference.field,
          });
        }
      }
    );

    /*
     * =====================================================
     * ARRAY NODES
     * =====================================================
     */

    parsed.arrays.forEach(
      (array, index) => {
        nodes.push({
          id: `array-${array.name}`,

          type: "arrayNode",

          position: {
            x: index * 420 + 80,
            y: 700,
          },

          data: {
            label: array.name,
            type: array.type,
            values: array.values,
          },
        });
      }
    );

    /*
     * =====================================================
     * LINKED LIST NODES
     * =====================================================
     */

    parsed.linkedListNodes.forEach(
      (linkedNode, index) => {
        nodes.push({
          id: `linked-${linkedNode.name}`,

          type: "linkedListNode",

          position: {
            x: index * 230 + 80,
            y: 950,
          },

          data: {
            label: linkedNode.name,
            value: linkedNode.value,
            next: linkedNode.next,
          },
        });
      }
    );

    /*
     * =====================================================
     * LINKED LIST NEXT EDGES
     * =====================================================
     *
     * first.next = second;
     *
     * first --------------> second
     *
     */

    parsed.linkedListReferences.forEach(
      (reference, index) => {
        const sourceExists =
          parsed.linkedListNodes.some(
            (node) =>
              node.name ===
              reference.from
          );

        const targetExists =
          parsed.linkedListNodes.some(
            (node) =>
              node.name ===
              reference.to
          );

        if (
          sourceExists &&
          targetExists
        ) {
          edges.push({
            id: `linked-edge-${index}`,

            source: `linked-${reference.from}`,

            sourceHandle: "next",

            target: `linked-${reference.to}`,

            targetHandle: "input",

            type: "smoothstep",

            animated: true,

            label: "next",
          });
        }
      }
    );

    return {
      nodes,
      edges,
    };
  }, [parsed]);

  return (
    <div className="app">

      {/* =================================================
          HEADER
      ================================================= */}

      <header className="header">

        <div>
          <h1>
            Java Visualizer
          </h1>

          <p>
            Real-time Java data structure
            visualization
          </p>
        </div>

        <div className="stats">

          <div className="stat">
            <strong>
              {parsed.classes.length}
            </strong>

            <span>
              Classes
            </span>
          </div>

          <div className="stat">
            <strong>
              {parsed.objects.length}
            </strong>

            <span>
              Objects
            </span>
          </div>

          <div className="stat">
            <strong>
              {parsed.arrays.length}
            </strong>

            <span>
              Arrays
            </span>
          </div>

          <div className="stat">
            <strong>
              {parsed.linkedListNodes.length}
            </strong>

            <span>
              LL Nodes
            </span>
          </div>

        </div>

      </header>

      {/* =================================================
          MAIN
      ================================================= */}

      <main className="main">

        {/* =================================================
            CODE EDITOR
        ================================================= */}

        <section className="editor-panel">

          <div className="panel-title">
            <span>
              Java Code
            </span>

            <span className="live">
              ● LIVE
            </span>
          </div>

          <div className="editor">
            <Editor
              height="100%"
              defaultLanguage="java"
              theme="vs-dark"
              value={code}
              onChange={(value) =>
                setCode(value || "")
              }
              options={{
                minimap: {
                  enabled: false,
                },

                fontSize: 14,

                lineNumbers: "on",

                automaticLayout: true,

                scrollBeyondLastLine: false,

                padding: {
                  top: 15,
                },

                tabSize: 4,
              }}
            />
          </div>

        </section>

        {/* =================================================
            VISUALIZER
        ================================================= */}

        <section className="visualizer-panel">

          <div className="panel-title">
            <span>
              Visualizer
            </span>

            <span className="element-count">
              {nodes.length} elements
            </span>
          </div>

          <div className="flow-container">

            {nodes.length === 0 ? (
              <div className="empty-state">
                <div>
                  Start writing Java code...
                </div>

                <span>
                  Your data structures will
                  appear here.
                </span>
              </div>
            ) : (
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{
                  padding: 0.2,
                }}
                minZoom={0.2}
                maxZoom={2}
                defaultEdgeOptions={{
                  type: "smoothstep",
                }}
              >
                <Background
                  gap={20}
                  size={1}
                />

                <Controls />

                <MiniMap />

              </ReactFlow>
            )}

          </div>

        </section>

      </main>

    </div>
  );
}

export default App;